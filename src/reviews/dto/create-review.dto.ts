import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateReviewDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  customerName!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  cumplimientoHorarioServicio!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  amabilidadDisponibilidadStaff!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  lugarLimpio!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  calidadProductosServicio!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  instalacionAdecuadaFiestas!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  comidaTiempoForma!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  recomendariaMagicCity!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  satisfaccionGeneral!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  recommendations?: string;
}
