import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getStatus(): { status: 'ok'; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
