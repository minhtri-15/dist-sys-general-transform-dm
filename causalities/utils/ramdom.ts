const RANDOM_STRING: string[] = [ "apple", "banana", "orange", "grape", "watermelon", "strawberry", "blueberry", "pineapple", "mango", "peach", "cherry", "lemon", "kiwi", "coconut", "avocado"];

export const randomString = (seed: number = 0): string => {
  const index = Math.floor(Math.random() * RANDOM_STRING.length);
  const rand = [RANDOM_STRING[index], RANDOM_STRING[Number(Date.now() % RANDOM_STRING.length)]];
  return rand[seed % 2] ?? 'null';
};