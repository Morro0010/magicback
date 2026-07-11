import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export enum EventDrinkOption {
  AGUA_FRESCA = 'AGUA_FRESCA',
  HORCHATA = 'HORCHATA',
  JAMAICA = 'JAMAICA',
  LIMA = 'LIMA',
  LIMON_CON_CHIA = 'LIMON_CON_CHIA',
}

export enum EventCakeOption {
  VAINILLA = 'VAINILLA',
  CHOCOLATE = 'CHOCOLATE',
  MARMOLEADO = 'MARMOLEADO',
  CAJETA_CHOCOLATE_MERMELADA = 'CAJETA_CHOCOLATE_MERMELADA',
}

export enum EventDecorationPackage {
  MEDIA_MAMPARA = 'MEDIA_MAMPARA',
  MAMPARA_COMPLETA = 'MAMPARA_COMPLETA',
}

export enum EventAreaType {
  AREA_CHICA = 'AREA_CHICA',
  AREA_GRANDE = 'AREA_GRANDE',
}

export enum EventPackageType {
  BASICO = 'BASICO',
  BASICO_SPA = 'BASICO_SPA',
  BASICO_DECORACION_PREMIUM = 'BASICO_DECORACION_PREMIUM',
}

export enum EventFoodOption {
  PIZZA = 'PIZZA',
  POZOLE = 'POZOLE',
  TACOS_TUXPENOS = 'TACOS_TUXPENOS',
}

export enum EventCakeProvider {
  DAIRY_QUEEN = 'DAIRY_QUEEN',
}

export enum EventType {
  BIRTHDAY_PARTY = 'birthday_party',
  SPACE_RENTAL = 'space_rental',
  PRIVATE_EVENT = 'private_event',
}

export class EventGuestCountsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  children?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  adults?: number;
}

export class EventSelectedOptionsDto {
  @IsOptional()
  @IsEnum(EventDrinkOption)
  freshWaterFlavor?: EventDrinkOption;

  @IsOptional()
  @IsEnum(EventFoodOption)
  foodOption?: EventFoodOption;

  @IsOptional()
  @IsEnum(EventCakeProvider)
  cakeProvider?: EventCakeProvider;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cakeFlavor?: string;
}

export class EventSpaAddOnDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  participants?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  manualPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  observations?: string;
}

export class EventPremiumDecorationAddOnDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  characterTheme?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  balloonColors?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  manualPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  observations?: string;
}

export class EventAddOnsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => EventSpaAddOnDto)
  spa?: EventSpaAddOnDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EventPremiumDecorationAddOnDto)
  premiumDecoration?: EventPremiumDecorationAddOnDto;
}

export class EventPrivateEventDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  totalPeople?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  appliedRange?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  appliedPrice?: number;
}

export class EventFormDto {
  @IsOptional()
  @IsEnum(EventType)
  eventType?: EventType;

  @IsOptional()
  @IsBoolean()
  requiresInvoice?: boolean;

  @IsOptional()
  @IsEnum(EventAreaType)
  areaType?: EventAreaType;

  @IsOptional()
  @IsEnum(EventPackageType)
  packageType?: EventPackageType;

  @IsOptional()
  @ValidateNested()
  @Type(() => EventGuestCountsDto)
  guestCounts?: EventGuestCountsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EventSelectedOptionsDto)
  selectedOptions?: EventSelectedOptionsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EventAddOnsDto)
  addOns?: EventAddOnsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EventPrivateEventDto)
  privateEvent?: EventPrivateEventDto;

  @IsOptional()
  @IsString()
  @MaxLength(1800)
  internalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  responsibleName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  celebrantAge?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  eventTheme?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  childrenCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  adultsCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  pizzaFlavor?: string;

  @IsOptional()
  @IsBoolean()
  pizzaSpecial?: boolean;

  @IsOptional()
  @IsEnum(EventDrinkOption)
  drinkOption?: EventDrinkOption;

  @IsOptional()
  @IsEnum(EventCakeOption)
  cakeOption?: EventCakeOption;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(300)
  popcornUnits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(300)
  candyBagUnits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(300)
  tableCenterpiecesUnits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(300)
  botanaTrayUnits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(300)
  fruitTrayUnits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(300)
  gelatinIndividualUnits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(300)
  gelatinCompleteUnits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(300)
  cupcakesUnits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(300)
  extraChocolateUnits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(300)
  extraVanillaUnits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(300)
  extraMarbleUnits?: number;

  @IsOptional()
  @IsEnum(EventDecorationPackage)
  decorationPackage?: EventDecorationPackage;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  neonUnits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  confettiUnits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  characterFigureUnits?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1800)
  generalComments?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  satisfactionScore?: number;
}
