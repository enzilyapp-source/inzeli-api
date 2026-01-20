// src/store/store.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class StoreService {
  constructor(private prisma: PrismaService) {}

  async list() {
    return this.prisma.storeItem.findMany({
      where: { active: true },
      orderBy: [{ kind: 'asc' }, { price: 'asc' }],
    });
  }

  async myItems(userId: string) {
    return this.prisma.userItem.findMany({
      where: { userId },
      include: { item: true },
      orderBy: [{ item: { kind: 'asc' } }],
    });
  }

  async buy(userId: string, itemId: string) {
    const item = await this.prisma.storeItem.findUnique({ where: { id: itemId } });
    if (!item || !item.active) throw new NotFoundException('ITEM_NOT_FOUND');

    const owned = await this.prisma.userItem.findUnique({
      where: { userId_itemId: { userId, itemId } },
    });
    if (owned) return { alreadyOwned: true, balance: await this.balance(userId) };

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

  async apply(userId: string, data: { themeId?: string | null; frameId?: string | null; cardId?: string | null }) {
    const updates: any = {};

    const checkOwnership = async (itemId: string | null | undefined) => {
      if (!itemId) return false;
      const owned = await this.prisma.userItem.findUnique({
        where: { userId_itemId: { userId, itemId } },
      });
      if (!owned) throw new BadRequestException('ITEM_NOT_OWNED');
      return true;
    };

    if (data.themeId !== undefined) {
      if (data.themeId === null || data.themeId === '') updates.themeId = null;
      else if (await checkOwnership(data.themeId)) updates.themeId = data.themeId;
    }
    if (data.frameId !== undefined) {
      if (data.frameId === null || data.frameId === '') updates.frameId = null;
      else if (await checkOwnership(data.frameId)) updates.frameId = data.frameId;
    }
    if (data.cardId !== undefined) {
      if (data.cardId === null || data.cardId === '') updates.cardId = null;
      else if (await checkOwnership(data.cardId)) updates.cardId = data.cardId;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updates,
      select: {
        id: true,
        themeId: true,
        frameId: true,
        cardId: true,
        creditBalance: true,
      },
    });

    return user;
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
