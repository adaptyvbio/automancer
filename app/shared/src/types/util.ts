declare const brand: unique symbol;

export type Brand<T, TBrand extends string> = T & {
  [brand]: TBrand;
};


export type OrdinaryId = number | string;


export type Depromisify<T> = T extends Promise<infer U> ? U : never;
export type UnionToIntersection<T> = (T extends any ? ((k: T) => void) : never) extends ((k: infer S) => void) ? S : never;


type Join<Tuple extends string[], Glue extends string> = Tuple extends [infer Head]
  ? Head & string
  : Tuple extends [infer Head, ...(infer Tail)]
    ? Tail extends string[] // Not sure why this is needed
      ? `${Head & string}${Glue}${Join<Tail, Glue>}`
      : never
    : never;
