<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Phone OTP Setup (Inzeli)

The auth flow now supports phone verification via OTP for registration:

- `POST /api/auth/register/request-otp`
- `POST /api/auth/register/verify-otp`

### Required Environment Variables (SMS)

Use Twilio SMS for real OTP delivery:

```bash
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1XXXXXXXXXX
```

Optional WhatsApp OTP fallback:

```bash
# Approved Twilio WhatsApp sender, e.g. whatsapp:+14155238886 or +14155238886
TWILIO_WHATSAPP_FROM=whatsapp:+1XXXXXXXXXX

# Recommended for production: approved WhatsApp authentication Content Template SID
TWILIO_WHATSAPP_CONTENT_SID=HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional template variables JSON. {{CODE}} is replaced at send time.
# Default is {"1":"<otp>"} for one-variable authentication templates.
TWILIO_WHATSAPP_CONTENT_VARIABLES={"1":"{{CODE}}"}

# For sandbox/testing only. Production business-initiated WhatsApp OTP should use a template.
TWILIO_WHATSAPP_ALLOW_FREEFORM=false

# Enables delayed fallback when Twilio later marks SMS failed/undelivered.
# Use your public API domain; route is POST /api/auth/otp/status.
PUBLIC_API_BASE_URL=https://api.enzily.app
TWILIO_STATUS_CALLBACK_SECRET=change-me
```

Optional controls:

```bash
# OTP TTL in seconds (default: 300)
AUTH_OTP_TTL_SEC=300

# Max OTP attempts per challenge (default: 5)
AUTH_OTP_MAX_ATTEMPTS=5

# Min seconds between OTP sends per phone (default: 45)
AUTH_OTP_RATE_WINDOW_SEC=45

# JWT lifetime for mobile sessions (default: 365d)
JWT_EXPIRES_IN=365d

# Optional hardening for old users:
# if true, login rejects non-test users without verified phone
AUTH_REQUIRE_VERIFIED_PHONE_ON_LOGIN=false

# Optional debug (never enable in production)
AUTH_DEBUG_OTP=false

# Optional explicit test account bypass list
AUTH_TEST_ACCOUNT_EMAILS=review@enzily.app,review@inzeli.app,test1@test.com,test2@test.com,test3@test.com,test4@test.com
AUTH_TEST_ACCOUNT_PHONES=
```

### Test Accounts (5 accounts including Review)

Seed test accounts with:

```bash
npm run seed:test-users
```

Default password:

- `Test@123456`

You can override it:

```bash
TEST_ACCOUNT_PASSWORD=YourStrongPass npm run seed:test-users
```

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
