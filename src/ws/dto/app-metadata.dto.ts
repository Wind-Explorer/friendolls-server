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
          const object = args?.object as PresenceStatusDto;
          const hasTitle =
            typeof object.title === 'string' && object.title.trim().length > 0;
          const hasSubtitle =
            typeof object.subtitle === 'string' &&
            object.subtitle.trim().length > 0;
          return hasTitle || hasSubtitle;
        },
        defaultMessage() {
          return 'At least one of title or subtitle must be a non-empty string';
        },
      },
    },
    validationOptions,
  );
}

export class PresenceStatusDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @IsAtLeastOneNameProvided()
  title: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtitle: string | null;

  @IsOptional()
  @IsString()
  graphicsB64: string | null;
}
