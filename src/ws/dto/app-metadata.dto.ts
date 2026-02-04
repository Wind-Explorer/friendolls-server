import {
  IsOptional,
  IsString,
  MaxLength,
  ValidateBy,
  ValidationOptions,
} from 'class-validator';

/**
 * Custom validator to ensure at least one of localized or unlocalized is a non-empty string
 */
function IsAtLeastOneNameProvided(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isAtLeastOneNameProvided',
      validator: {
        validate(value, args) {
          const object = args?.object as AppMetadataDto;
          const hasLocalized =
            typeof object.localized === 'string' &&
            object.localized.trim().length > 0;
          const hasUnlocalized =
            typeof object.unlocalized === 'string' &&
            object.unlocalized.trim().length > 0;
          return hasLocalized || hasUnlocalized;
        },
        defaultMessage() {
          return 'At least one of localized or unlocalized must be a non-empty string';
        },
      },
    },
    validationOptions,
  );
}

export class AppMetadataDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @IsAtLeastOneNameProvided()
  localized: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  unlocalized: string | null;

  @IsOptional()
  @IsString()
  appIconB64: string | null;
}
