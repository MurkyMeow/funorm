// === COLUMN

interface ColumnType {
  string: string
  int: number
}

interface Column<T extends keyof ColumnType> {
  type: T
  nullable?: boolean
  primary?: boolean
  initial?: ColumnType[T]
}

export const primary = (): Column<'int'> => ({
  type: 'int',
  primary: true,
})

export const column = <T extends keyof ColumnType>(
  type: T,
  params?: Omit<Column<T>, 'type'>,
): Column<T> =>
  ({ ...params, type })

// === Entity

type EntityColumns =
  { [name: string]: Column<keyof ColumnType> }

type ExtractColumnType<T> =
  T extends Column<infer U> ? ColumnType[U] : never

export type Entity<T extends EntityColumns> =
  { [K in keyof T]: ExtractColumnType<T[K]> }

export const entity = <N extends string, K extends EntityColumns>(
  name: N,
  columns: K,
) => <E>(db: Database<E>): Database<E & { [x in N]: K }> => ({
  ...db,
  entities: Object.assign(db.entities, { [name as N]: columns }),
})

// === DATABASE

export interface Database<T> {
  entities: T
  findOne: <K extends keyof T>(entity: K) => T[K] extends EntityColumns ? Entity<T[K]> : never
}

export const connect = (): Database<{}> => ({
  entities: {},
  findOne() {},
})
