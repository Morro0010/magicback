import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EventFormDto } from './event-form.dto';

describe('EventFormDto celebrantBirthDate', () => {
  it('accepts and normalizes a calendar date', async () => {
    const dto = plainToInstance(EventFormDto, {
      celebrantBirthDate: '2018-7-3',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.celebrantBirthDate).toBe('2018-07-03');
  });

  it('rejects impossible calendar dates', async () => {
    const dto = plainToInstance(EventFormDto, {
      celebrantBirthDate: '2018-02-30',
    });

    const errors = await validate(dto);
    expect(errors[0]?.property).toBe('celebrantBirthDate');
  });
});
