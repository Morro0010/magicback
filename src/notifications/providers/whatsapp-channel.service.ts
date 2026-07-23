import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createWhatsAppLink,
  normalizePhoneNumber,
} from '../../common/utils/phone.util';

type WhatsAppSendInput = {
  to: string;
  text: string;
};

type WhatsAppSendResult = {
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  provider: string;
  errorMessage?: string;
  preparedUrl?: string;
};

@Injectable()
export class WhatsAppChannelService {
  private readonly logger = new Logger(WhatsAppChannelService.name);

  constructor(private readonly configService: ConfigService) {}

  async send(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
    const provider =
      this.configService.get<string>('WHATSAPP_PROVIDER') ?? 'whatsapp_link';
    const enabled =
      this.configService.get<string>('WHATSAPP_ENABLED') !== 'false';
    const defaultCountryCode =
      this.configService.get<string>('WHATSAPP_DEFAULT_COUNTRY_CODE') ?? '52';

    if (provider === 'whatsapp_link') {
      const preparedUrl = createWhatsAppLink(
        input.to,
        input.text,
        defaultCountryCode,
      );
      const destination = normalizePhoneNumber(input.to, defaultCountryCode);

      if (!preparedUrl || !destination) {
        return {
          status: 'SKIPPED',
          provider,
          errorMessage: 'Número inválido o mensaje vacío para WhatsApp',
        };
      }

      return {
        status: 'SKIPPED',
        provider,
        preparedUrl,
        errorMessage:
          'Mensaje preparado para WhatsApp manual; no se envió automáticamente',
      };
    }

    if (!enabled || provider === 'disabled') {
      return {
        status: 'SKIPPED',
        provider,
        errorMessage: 'WhatsApp deshabilitado en configuración',
      };
    }

    if (provider === 'mock') {
      if (input.to.includes('0000')) {
        return {
          status: 'FAILED',
          provider,
          errorMessage: 'Proveedor mock forzado a error por número de prueba',
        };
      }

      return {
        status: 'SENT',
        provider,
      };
    }

    const apiUrl = this.configService.get<string>('WHATSAPP_API_URL');
    const apiToken = this.configService.get<string>('WHATSAPP_API_TOKEN');
    const from = this.configService.get<string>('WHATSAPP_FROM') ?? '';
    const timeoutMs = Number(
      this.configService.get<string>('WHATSAPP_TIMEOUT_MS') ?? 4_000,
    );

    if (!apiUrl || !apiToken) {
      return {
        status: 'FAILED',
        provider,
        errorMessage: 'Falta configuración de API de WhatsApp',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
          to: input.to,
          text: input.text,
          from,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        return {
          status: 'FAILED',
          provider,
          errorMessage: `HTTP ${response.status}: ${body.slice(0, 300)}`,
        };
      }

      return {
        status: 'SENT',
        provider,
      };
    } catch (error) {
      this.logger.warn(`Error en envío WhatsApp: ${(error as Error).message}`);
      return {
        status: 'FAILED',
        provider,
        errorMessage: (error as Error).message,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
