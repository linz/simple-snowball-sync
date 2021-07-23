import o from 'ospec';
import { logger } from '../log';
import { ErrorList } from '../error.list';

o.spec('ErrorList', () => {
  const errors: Error[] = [];

  for (let i = 0; i < 3; i++) {
    errors.push(new Error((errors.length + 1).toString()));
  }

  if (errors.length === 3) {
    const error = new ErrorList('ErrorList contains errors', errors);
    console.log(error.message);
    logger.error({ err: error }, 'ErrorListTest');
  }
});
