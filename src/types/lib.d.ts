// The browser and language library, with the functions that give `any` giving `unknown` instead: a value read from
// JSON or a prototype is checked before it is used, and an array found by Array.isArray keeps its element type. Types only; the product holds none of this.
interface JSON {
  parse(text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown): unknown;
}
interface ArrayConstructor {
  isArray<T>(value: T): value is Extract<T, readonly unknown[]> extends never ? T & unknown[] : Extract<T, readonly unknown[]>;
}
interface ObjectConstructor {
  // freeze gives back what it is given, read-only; tried first, so a table written in it is read in the type it is
  // given to (the callbacks in it take their parameters' types from there). No function is frozen.
  freeze<T>(o: T): Readonly<T>;
  getPrototypeOf(value: unknown): object | null;
  // hasOwn makes any value a key by its text (an object whose text throws would throw: read data has none).
  hasOwn(o: object, v: unknown): boolean;
  values<T>(o: { [s: string]: T } | ArrayLike<T>): T[];
  values(o: {}): unknown[];
  entries<T>(o: { [s: string]: T } | ArrayLike<T>): [string, T][];
  entries(o: {}): [string, unknown][];
}
interface Body {
  json(): Promise<unknown>;
}
// What a store of the browser keeps is read as data (unknown), checked before it is used.
interface IDBObjectStore { get(query: IDBValidKey | IDBKeyRange): IDBRequest<unknown> }
// Whether a list or a set holds a value (and where a list has it), and what a map holds for a key, are asked of any
// value (the answer for one of another type is false, -1 or undefined, and deleting it deletes nothing), so the value
// asked about need not already have the element or key type.
interface Array<T> { includes(searchElement: unknown, fromIndex?: number): boolean; indexOf(searchElement: unknown, fromIndex?: number): number }
interface ReadonlyArray<T> { includes(searchElement: unknown, fromIndex?: number): boolean; indexOf(searchElement: unknown, fromIndex?: number): number }
interface Set<T> { has(value: unknown): boolean; delete(value: unknown): boolean }
interface ReadonlySet<T> { has(value: unknown): boolean }
interface WeakSet<T extends WeakKey> { has(value: unknown): boolean; delete(value: unknown): boolean }
interface Map<K, V> { has(key: unknown): boolean; get(key: unknown): V | undefined; delete(key: unknown): boolean }
interface ReadonlyMap<K, V> { has(key: unknown): boolean; get(key: unknown): V | undefined }
// What a promise is rejected with may be any value (a throw of anything), so the reason is unknown.
interface Promise<T> {
  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2>;
  catch<TResult = never>(onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | undefined | null): Promise<T | TResult>;
}
// A regular expression tests the text of any value (test converts it to a string), as the checks of read data do.
interface RegExp { test(string: unknown): boolean }
// apply takes the arguments as any array-like list (String.fromCharCode.apply(null, bytes)).
interface CallableFunction { apply<T, R>(this: (this: T, ...args: number[]) => R, thisArg: T, args: ArrayLike<number>): R }
// The older name of AudioContext in some browsers, a property of the global object there, so it is read as
// globalThis.webkitAudioContext. No global name is declared for it: where it is missing, reading the bare name throws
// (ReferenceError), and a declared name would let code read it so.
type OlderAudioGlobal = typeof globalThis & { webkitAudioContext?: typeof AudioContext };
// Clearing a value that is no timer does nothing (a scheduler keeps other wakes in the same place).
declare function clearTimeout(timeout: unknown): void;
declare function clearInterval(interval: unknown): void;
// filter(Boolean) keeps the values that are not falsy: it drops false, null, undefined, 0, 0n and the empty text (the
// types still hold NaN, which it drops too).
interface Array<T> { filter(predicate: BooleanConstructor): Exclude<T, false | null | undefined | 0 | 0n | ''>[] }
interface ReadonlyArray<T> { filter(predicate: BooleanConstructor): Exclude<T, false | null | undefined | 0 | 0n | ''>[] }
// setProperty writes the text of the value it is given (a number in digits) to a custom property (--name); a property of
// the browser takes a text (a length needs its unit). This declaration takes the place of the library's (which is on
// CSSStyleDeclarationBase), so the library's form is written again.
interface CSSStyleDeclaration {
  setProperty(property: `--${string}`, value: string | number | null, priority?: string): void;
  setProperty(property: string, value: string | null, priority?: string): void;
}
// parseFloat reads the text of the value it is given: a number as String writes it (parseFloat(0) is 0).
declare function parseFloat(string: string | number): number;
// replace writes what its function gives back as String writes it (a number in digits). This form is tried first (a
// later declaration's forms come before the library's): the arguments after the match take the types the function
// writes, and one it writes no type for is unknown. The type check holds each written type to what replace gives at
// that place (audit/lib/type-check.mjs, replacerIssues).
interface String { replace<A extends unknown[]>(searchValue: string | RegExp, replacer: (substring: string, ...args: A) => string | number): string }
