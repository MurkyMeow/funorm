import knex, { CreateTableBuilder, ColumnBuilder } from 'knex'

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

export type EntityDefinitions =
  { [x: string]: EntityColumns }

// === DATABASE

export interface DatabaseOptions<T extends EntityDefinitions> {
  entities: T
  connection: string
}

function getColumn(
  table: CreateTableBuilder,
  type: keyof ColumnType
): (name: string) => ColumnBuilder {
  switch (type) {
    case 'int': return table.integer
    case 'string': return table.string
  }
}

function addColumns(table: CreateTableBuilder, columns: EntityColumns): void {
  for (const [name, data] of Object.entries(columns)) {
    const column = getColumn(table, data.type).apply(table, [name])
    if (data.primary) column.primary()
    if (!data.nullable) column.notNullable()
  }
}

export const create = async <T extends EntityDefinitions>(opts: DatabaseOptions<T>) => {
  const client = knex({
    client: 'pg',
    connection: opts.connection,
  })

  // sync tables
  for (const [name, cols] of Object.entries(opts.entities)) {
    const exists = await client.schema.hasTable(name)
    if (exists) continue
    await client.schema.createTable(name, table => addColumns(table, cols))
  }

  return {
    async findOne<K extends keyof T>(name: K): Promise<Entity<T[K]> | null> {
      const res = await client
        .select('*')
        .from(name as string)
        .first()
      return res as Entity<T[K]> || null
    },
  }
}
