import { Body, Controller, Post, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { LoginDto } from '../auth/dto/login.dto';
import { configureBodyParsing } from './body-parsing';

@Controller()
class ParsingFixture {
  @Post('auth/login') login(@Body() data: LoginDto) { return { email: data.email, passwordReceived: !!data.password }; }
  @Post('rooms/:code/score-sheet') score(@Body() data: any) { return { length: data.text.length }; }
}

describe('Scoped score-sheet body parsing does not break existing auth', () => {
  it('parses normal login JSON and permits larger ledgers only on the score endpoint', async () => {
    const module = await Test.createTestingModule({ controllers: [ParsingFixture] }).compile();
    const app = module.createNestApplication();
    configureBodyParsing(app); app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    try {
      await request(app.getHttpServer()).post('/api/auth/login').send({email:'host@score-lab.invalid',password:'local-test'}).expect(201)
        .expect({email:'host@score-lab.invalid',passwordReceived:true});
      await request(app.getHttpServer()).post('/api/rooms/LOCAL/score-sheet').send({text:'x'.repeat(120000)}).expect(201).expect({length:120000});
      await request(app.getHttpServer()).post('/api/auth/login').send({email:'host@score-lab.invalid',password:'x'.repeat(120000)}).expect(413);
    } finally { await app.close(); }
  });
});
