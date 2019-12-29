import knex from 'knex'

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

function getColAliases(colType: keyof ColumnType): string[] {
  switch (colType) {
    case 'int': return ['int', 'integer']
    case 'string': return ['string', 'character varying']
    default: return []
  }
}

async function validateEntity(entityName: string, cols: EntityColumns, client: knex): Promise<string[]> {
  const exists = await client.schema.hasTable(entityName)
  if (!exists) return [`${entityName}: table is not found`]

  const errors: string[] = []
  const builder = client(entityName)

  const viewNull = (nullable?: boolean): string =>
    nullable ? '"nullable"' : '"not nullable"'

  for (const [colName, data] of Object.entries(cols)) {
    const info = await builder.columnInfo(colName)
    if (!info.type) {
      errors.push(`could not find column "${colName}"`)
      continue
    }
    if (!getColAliases(data.type).includes(info.type)) {
      errors.push(`"${colName}" is defined as ${data.type} but instead saw ${info.type}`)
    }
    if (info.nullable !== Boolean(data.nullable)) {
      errors.push(`"${colName}" is defined as ${viewNull(data.nullable)} but instead saw ${viewNull(info.nullable)}`)
    }
  }

  return errors.map(err => `${entityName}: ${err}`)
}

export const create = async <T extends EntityDefinitions>(opts: DatabaseOptions<T>) => {
  const client = knex({
    client: 'pg',
    connection: opts.connection,
  })

  const validationTasks = Object
    .entries(opts.entities)
    .map(([entityName, cols]) => validateEntity(entityName, cols, client))

  const errors = (await Promise.all(validationTasks)).flat()

  if (errors.length) {
    throw new Error('\n FUNORM VALIDATION: \n' + errors.join('\n'))
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
