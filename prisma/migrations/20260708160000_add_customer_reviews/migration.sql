-- CreateTable
CREATE TABLE "CustomerReview" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "cumplimientoHorarioServicio" INTEGER NOT NULL,
    "amabilidadDisponibilidadStaff" INTEGER NOT NULL,
    "lugarLimpio" INTEGER NOT NULL,
    "calidadProductosServicio" INTEGER NOT NULL,
    "instalacionAdecuadaFiestas" INTEGER NOT NULL,
    "comidaTiempoForma" INTEGER NOT NULL,
    "recomendariaMagicCity" INTEGER NOT NULL,
    "satisfaccionGeneral" INTEGER NOT NULL,
    "recommendations" TEXT,
    "averageRating" DECIMAL(3,2) NOT NULL,
    "metadataJson" JSONB,
    "capturedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerReview_createdAt_idx" ON "CustomerReview"("createdAt");

-- CreateIndex
CREATE INDEX "CustomerReview_averageRating_idx" ON "CustomerReview"("averageRating");

-- CreateIndex
CREATE INDEX "CustomerReview_capturedByUserId_idx" ON "CustomerReview"("capturedByUserId");

-- AddForeignKey
ALTER TABLE "CustomerReview" ADD CONSTRAINT "CustomerReview_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
