// src/store/store.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class StoreService {
  constructor(private prisma: PrismaService) {}

  private static readonly VIP_MONTHLY_ITEM_ID = 'vip_monthly';
  private static readonly VIP_THEME_IDS = new Set([
    'frame_sadu',
    'frame_janjfa',
    'frame_dama',
    'frame_diwaniya',
    'frame_fanar',
    'frame_nokhatha',
  ]);

  private vipMonthlyPrice() {
    const parsed = Number(process.env.VIP_MONTHLY_PRICE ?? 250);
    if (!Number.isFinite(parsed)) return 250;
    return Math.max(0, Math.trunc(parsed));
  }

  private vipMonthlyDays() {
    const parsed = Number(process.env.VIP_MONTHLY_DAYS ?? 30);
    if (!Number.isFinite(parsed)) return 30;
    return Math.max(1, Math.trunc(parsed));
  }

  private vipSubscriptionItem() {
    return {
      id: StoreService.VIP_MONTHLY_ITEM_ID,
      kind: 'subscription',
      name: 'VIP شهري',
      price: this.vipMonthlyPrice(),
      description: 'اشتراك شهري',
      preview: 'يفتح ثيمات VIP لمدة شهر',
      active: true,
      vipOnly: false,
      vipDays: this.vipMonthlyDays(),
    };
  }

  private hasActiveVip(vipUntil: Date | null | undefined) {
    if (!vipUntil) return false;
    return vipUntil.getTime() > Date.now();
  }

  async list() {
    const items = await this.prisma.storeItem.findMany({
      where: { active: true },
      orderBy: [{ kind: 'asc' }, { price: 'asc' }],
    });
    return [
      this.vipSubscriptionItem(),
      ...items.map((item) => ({
        ...item,
        vipOnly: StoreService.VIP_THEME_IDS.has(item.id),
      })),
    ];
  }

  async myItems(userId: string) {
    return this.prisma.userItem.findMany({
      where: { userId },
      include: { item: true },
      orderBy: [{ item: { kind: 'asc' } }],
    });
  }

  async buy(userId: string, itemId: string) {
    if (itemId === StoreService.VIP_MONTHLY_ITEM_ID) {
      const days = this.vipMonthlyDays();
      const price = this.vipMonthlyPrice();
      return this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { creditBalance: true, vipUntil: true },
        });
        if (!user) throw new NotFoundException('USER_NOT_FOUND');
        if ((user.creditBalance ?? 0) < price) {
          throw new BadRequestException('NOT_ENOUGH_CREDIT');
        }

        const now = new Date();
        const base =
          user.vipUntil && user.vipUntil > now ? user.vipUntil : now;
        const nextVipUntil = new Date(base.getTime());
        nextVipUntil.setDate(nextVipUntil.getDate() + days);

        const updated = await tx.user.update({
          where: { id: userId },
          data: {
            creditBalance: { decrement: price },
            vipUntil: nextVipUntil,
          },
          select: { creditBalance: true, vipUntil: true },
        });

        return {
          itemId,
          balance: updated.creditBalance ?? 0,
          vipUntil: updated.vipUntil,
          subscriptionActive: true,
        };
      });
    }

    const item = await this.prisma.storeItem.findUnique({
      where: { id: itemId },
    });
    if (!item || !item.active) throw new NotFoundException('ITEM_NOT_FOUND');

    const owned = await this.prisma.userItem.findUnique({
      where: { userId_itemId: { userId, itemId } },
    });
    if (owned)
      return { alreadyOwned: true, balance: await this.balance(userId) };

    const result = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.findUnique({
        where: { id: userId },
        select: { creditBalance: true },
      });
      if (!u) throw new NotFoundException('USER_NOT_FOUND');
      if ((u.creditBalance ?? 0) < item.price) {
        throw new BadRequestException('NOT_ENOUGH_CREDIT');
      }

      await tx.user.update({
        where: { id: userId },
        data: { creditBalance: { decrement: item.price } },
      });
      await tx.userItem.create({
        data: { userId, itemId },
      });

      const updated = await tx.user.findUnique({
        where: { id: userId },
        select: { creditBalance: true },
      });

      return { balance: updated?.creditBalance ?? 0 };
    });

    return { itemId, balance: result.balance };
  }

  async apply(
    userId: string,
    data: {
      themeId?: string | null;
      frameId?: string | null;
      cardId?: string | null;
    },
  ) {
    const updates: any = {};

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { vipUntil: true },
    });
    if (!user) throw new NotFoundException('USER_NOT_FOUND');

    const checkAccess = async (itemId: string | null | undefined) => {
      if (!itemId) return false;
      if (
        StoreService.VIP_THEME_IDS.has(itemId) &&
        this.hasActiveVip(user.vipUntil)
      ) {
        return true;
      }
      const owned = await this.prisma.userItem.findUnique({
        where: { userId_itemId: { userId, itemId } },
      });
      if (!owned) throw new BadRequestException('ITEM_NOT_OWNED');
      return true;
    };

    if (data.themeId !== undefined) {
      if (data.themeId === null || data.themeId === '') updates.themeId = null;
      else if (await checkAccess(data.themeId))
        updates.themeId = data.themeId;
    }
    if (data.frameId !== undefined) {
      if (data.frameId === null || data.frameId === '') updates.frameId = null;
      else if (await checkAccess(data.frameId))
        updates.frameId = data.frameId;
    }
    if (data.cardId !== undefined) {
      if (data.cardId === null || data.cardId === '') updates.cardId = null;
      else if (await checkAccess(data.cardId)) updates.cardId = data.cardId;
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updates,
      select: {
        id: true,
        themeId: true,
        frameId: true,
        cardId: true,
        creditBalance: true,
        vipUntil: true,
      },
    });

    return updatedUser;
  }

  async balance(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { creditBalance: true },
    });
    if (!u) throw new NotFoundException('USER_NOT_FOUND');
    return u.creditBalance ?? 0;
  }
}
