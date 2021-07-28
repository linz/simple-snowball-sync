import o from 'ospec';
import { ErrorList } from '../error.list';

o.spec('ErrorList', () => {
  o('stack should contain all the errors', async () => {
    const errors: Error[] = [];

    for (let i = 0; i < 3; i++) {
      errors.push(new Error((errors.length + 1).toString()));
    }

    const error = new ErrorList('ErrorList contains errors', errors);
    const stack = error.stack;
    o(stack?.includes('Error: 1')).equals(true);
    o(stack?.includes('Error: 2')).equals(true);
    o(stack?.includes('Error: 3')).equals(true);
  });
});
