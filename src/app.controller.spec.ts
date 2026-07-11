import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  it('initializes without default routes', () => {
    const controller = new AppController(new AppService());
    expect(controller).toBeDefined();
  });
});
