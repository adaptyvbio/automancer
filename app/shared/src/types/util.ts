declare const brand: unique symbol;

export type Brand<T, TBrand extends string> = T & {
  [brand]: TBrand;
};


export type OrdinaryId = number | string;


export type Depromisify<T> = T extends Promise<infer U> ? U : never;
export type UnionToIntersection<T> = (T extends any ? ((k: T) => void) : never) extends ((k: infer S) => void) ? S : never;
