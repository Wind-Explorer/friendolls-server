# Friendolls Server

Backend API for the Friendolls application built with NestJS, Keycloak authentication, and Prisma ORM.

## Tech Stack

- **Framework:** [NestJS](https://nestjs.com/) - Progressive Node.js framework
- **Authentication:** [Keycloak](https://www.keycloak.org/) - OpenID Connect (OIDC) / OAuth 2.0
- **Database ORM:** [Prisma](https://www.prisma.io/) - Next-generation TypeScript ORM
- **Database:** PostgreSQL
- **Language:** TypeScript
- **Package Manager:** pnpm

## Features

- ✅ Keycloak OIDC authentication with JWT tokens
- ✅ User management synchronized from Keycloak
- ✅ PostgreSQL database with Prisma ORM
- ✅ Swagger API documentation
- ✅ Role-based access control
- ✅ Global exception handling
- ✅ Environment-based configuration
- ✅ Comprehensive logging

## Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL 14+ (or Docker)
- Keycloak instance (for authentication)

## Getting Started

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/friendolls_dev?schema=public"

# Keycloak OIDC Configuration
JWKS_URI=https://your-keycloak-instance.com/realms/your-realm/protocol/openid-connect/certs
JWT_ISSUER=https://your-keycloak-instance.com/realms/your-realm
JWT_AUDIENCE=your-client-id
```

### 3. Set Up PostgreSQL Database

**Option A: Using Docker (Recommended for development)**

```bash
docker run --name friendolls-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=friendolls_dev \
  -p 5432:5432 \
  -d postgres:16-alpine
```

**Option B: Use existing PostgreSQL installation**

```bash
createdb friendolls_dev
```

See [docs/PRISMA_SETUP.md](docs/PRISMA_SETUP.md) for detailed database setup instructions.

### 4. Generate Prisma Client and Run Migrations

```bash
# Generate Prisma Client (creates TypeScript types)
pnpm prisma:generate

# Run migrations to create database schema
pnpm prisma:migrate

# If migration already exists, it will say "Already in sync"
```

**Important:** Always run `pnpm prisma:generate` after pulling new code or changing the Prisma schema.

### 5. Start the Development Server

```bash
pnpm start:dev
```

The server will be running at `http://localhost:3000`.

## Available Scripts

### Development

- `pnpm start:dev` - Start development server with hot reload
- `pnpm start:debug` - Start development server with debugging

### Production

- `pnpm build` - Build the application
- `pnpm start:prod` - Start production server

### Database (Prisma)

- `pnpm prisma:generate` - Generate Prisma Client
- `pnpm prisma:migrate` - Create and apply database migration
- `pnpm prisma:migrate:deploy` - Apply migrations in production
- `pnpm prisma:studio` - Open Prisma Studio (visual database browser)
- `pnpm db:push` - Push schema changes (dev only)
- `pnpm db:reset` - Reset database and reapply migrations

### Code Quality

- `pnpm lint` - Lint the code
- `pnpm format` - Format code with Prettier

### Testing

- `pnpm test` - Run unit tests
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:cov` - Run tests with coverage
- `pnpm test:e2e` - Run end-to-end tests

## API Documentation

Once the server is running, access the Swagger API documentation at:

```
http://localhost:3000/api
```

## Project Structure

```
friendolls-server/
├── prisma/                  # Prisma configuration
│   ├── migrations/         # Database migrations
│   └── schema.prisma       # Database schema
├── src/
│   ├── auth/               # Authentication module (Keycloak OIDC)
│   ├── common/             # Shared utilities and decorators
│   ├── config/             # Configuration
│   ├── database/           # Database module (Prisma)
│   │   ├── prisma.service.ts
│   │   └── database.module.ts
│   ├── users/              # Users module
│   │   ├── dto/           # Data Transfer Objects
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── users.entity.ts
│   ├── app.module.ts       # Root application module
│   └── main.ts            # Application entry point
├── test/                   # E2E tests
├── .env                    # Environment variables (gitignored)
├── package.json
└── tsconfig.json
```

## Database Schema

The application uses Prisma with PostgreSQL. The main entity is:

### User Model

- Synchronized from Keycloak OIDC
- Stores user profile information
- Tracks login history
- Manages user roles

## Authentication Flow

1. User authenticates via Keycloak
2. Keycloak issues JWT token
3. Client sends JWT in `Authorization: Bearer <token>` header
4. Server validates JWT against Keycloak's JWKS
5. User is automatically created/synced from token on first login
6. Subsequent requests update user's last login time

## Development Workflow

1. **Make schema changes** in `prisma/schema.prisma`
2. **Create migration**: `pnpm prisma:migrate`
3. **Implement business logic** in services
4. **Create/update DTOs** for request validation
5. **Update controllers** for API endpoints
6. **Test** your changes
7. **Lint and format**: `pnpm lint && pnpm format`
8. **Commit** your changes

## Environment Variables

| Variable       | Description                  | Required           | Example                                                             |
| -------------- | ---------------------------- | ------------------ | ------------------------------------------------------------------- |
| `PORT`         | Server port                  | No (default: 3000) | `3000`                                                              |
| `NODE_ENV`     | Environment                  | No                 | `development`, `production`                                         |
| `DATABASE_URL` | PostgreSQL connection string | **Yes**            | `postgresql://user:pass@host:5432/db`                               |
| `JWKS_URI`     | Keycloak JWKS endpoint       | **Yes**            | `https://keycloak.com/realms/myrealm/protocol/openid-connect/certs` |
| `JWT_ISSUER`   | JWT issuer (Keycloak realm)  | **Yes**            | `https://keycloak.com/realms/myrealm`                               |
| `JWT_AUDIENCE` | JWT audience (client ID)     | **Yes**            | `my-client-id`                                                      |

## Production Deployment

1. **Set environment variables** (especially `DATABASE_URL`)
2. **Install dependencies**: `pnpm install --prod`
3. **Generate Prisma Client**: `pnpm prisma:generate`
4. **Run migrations**: `pnpm prisma:migrate:deploy`
5. **Build application**: `pnpm build`
6. **Start server**: `pnpm start:prod`
