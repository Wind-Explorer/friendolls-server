# Friendolls

Passive social app connecting peers through mouse cursor interactions in the form of desktop pets.

# friendolls-server

Backend server for Friendolls.

## Commands

- **Error Checks**: `pnpm check`
- **Format/Lint**: `pnpm format`, `pnpm lint`
- **Test**: `pnpm test` (Unit), `pnpm test:e2e` (E2E)
- **Single Test**: `pnpm test -- -t "test name"` or `pnpm test -- src/path/to/file.spec.ts`
- **Database**: `npx prisma generate`, `npx prisma migrate dev`

## Code Style & Conventions

- **Architecture**: NestJS standard (Module -> Controller -> Service). Use DI.
- **Database**: `PrismaService` only. No raw SQL.
- **Validation**: strict `class-validator` DTOs (whitelisting enabled).
- **Naming**: `PascalCase` (Classes), `camelCase` (vars/methods), `kebab-case` (files).
- **Error Handling**: Standard NestJS exceptions (`NotFoundException`, etc).
- **Docs**: Swagger decorators (`@ApiOperation`, `@ApiResponse`) required on Controllers.
- **Imports**: External/NestJS first, then internal (relative paths).

## Note

Do not run the project yourself. Run error checks and lints to detect issues.
