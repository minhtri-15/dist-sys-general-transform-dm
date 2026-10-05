export interface SequenceCursor<T> {
  current(): T | null;
  get_index(): number;
  next(forward_steps?: number): T | null;
  back(backward?: number): T | null;
}

export interface SequenceCollection<T> {
  get_value(): Array<T>
  length(): number;
  at(index: number): T | null;
  cursor(position?: number): SequenceCursor<T>;
  get_last(): SequenceCursor<T>;
  for_each(callback: (element: T) => void): void;

  push_back(element: T): SequenceCursor<T>;
  get_element_with_query_callback(query: (element: T) => boolean, reversed: boolean): SequenceCursor<T>;
}