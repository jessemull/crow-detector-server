# Database Seeding and Reset Scripts

This directory contains comprehensive database seeding and reset scripts for the Crow Detector Server using TypeORM and NestJS best practices.

## Features

- **Realistic Data Generation**: Uses `@faker-js/faker` for realistic test data
- **Proper Relationships**: Maintains referential integrity between entities
- **Environment-Aware**: Respects your `.env` configuration
- **Safe Operations**: Never auto-syncs database schema
- **Comprehensive Logging**: Clear feedback on all operations

## Structure

```
scripts/db-seed/
├── seeders/           # Individual entity seeders
│   ├── base-seeder.ts # Base class with common utilities
│   ├── feed-event.seeder.ts
│   ├── detection-event.seeder.ts
│   └── index.ts
├── seeder.ts          # Main orchestrator class
├── seed.ts            # CLI script for seeding
├── reset.ts           # CLI script for resetting
├── reset-and-seed.ts  # CLI script for reset + seed
└── README.md          # This file
```

## Setup

### 1. Environment Variables

Ensure your `.env` file contains:

```bash
# Database Connection
RDS_HOST=your-rds-endpoint
RDS_PORT=5432
RDS_USERNAME=your-username
RDS_PASSWORD=your-password
RDS_DATABASE=crow_detector_db_dev

# SSL Configuration
SSL_REJECT_UNAUTHORIZED=false  # For RDS compatibility
NODE_ENV=development
```

### 2. Install Dependencies

```bash
npm install
```

## Usage

### Available Commands

```bash
# Seed the database with fresh data
npm run db:seed

# Reset the database (clear all data)
npm run db:reset

# Reset and then seed the database
npm run db:reset-and-seed
```

### Individual Scripts

```bash
# Run individual scripts directly
npx ts-node -r tsconfig-paths/register src/database/seed.ts
npx ts-node -r tsconfig-paths/register src/database/reset.ts
npx ts-node -r tsconfig-paths/register src/database/reset-and-seed.ts
```

## Seeding Process

The seeding process follows this order to respect foreign key constraints:

1. **Feed Events** - Creates 20 feed events with realistic data
2. **Detection Events** - Creates 50 detection events linked to feed events

### Generated Data

#### Feed Events
- **ID**: UUID (auto-generated)
- **Confidence**: Random float (0.1 - 1.0)
- **Image URLs**: Realistic image URLs
- **Source**: Random enum value (API, BUTTON, SCRIPT, TEST)
- **Status**: Random enum value (ACCEPTED, REJECTED) or undefined
- **Timestamps**: Random dates within reasonable range

#### Detection Events
- **ID**: UUID (auto-generated)
- **Confidence**: Random float (0.1 - 1.0)
- **Crow Count**: Random integer (1-20)
- **Image URLs**: Realistic image URLs
- **Feed Event**: Links to existing feed events
- **Timestamps**: Random dates within reasonable range

## Reset Process

The reset process clears data in reverse order:

1. **Detection Events** - Cleared first (child table)
2. **Feed Events** - Cleared second (parent table)

## Security Features

- **SSL Configuration**: Respects your SSL settings
- **No Auto-Sync**: Never automatically modifies database schema
- **Environment Variables**: Uses secure credential management
- **Connection Pooling**: Proper connection lifecycle management

## Troubleshooting

### Common Issues

1. **Connection Failed**
   - Check your `.env` variables
   - Verify RDS security group allows your IP
   - Ensure SSL configuration matches your setup

2. **Permission Denied**
   - Verify database user has appropriate permissions
   - Check if database exists and is accessible

3. **SSL Issues**
   - Set `SSL_REJECT_UNAUTHORIZED=false` for RDS
   - Use `SSL_REJECT_UNAUTHORIZED=true` for strict local development

### Debug Mode

Enable verbose logging by setting `NODE_ENV=development` in your `.env`.

## Production Considerations

- **Never run in production** without proper testing
- **Backup your data** before running reset scripts
- **Use staging environments** for testing
- **Monitor database performance** during seeding

## Best Practices

- **Run seeders in order** to maintain referential integrity
- **Use realistic data** for better testing
- **Clear data before seeding** to avoid duplicates
- **Test thoroughly** in development before production

## Contributing

When adding new entities:

1. Create a new seeder extending `BaseSeeder`
2. Implement `seed()` and `clear()` methods
3. Add to the main `DatabaseSeeder` orchestrator
4. Update this README with new entity details 