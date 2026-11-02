/**
 * Los renglones de la venta, en su parte pura (S44, S45).
 *
 * La pantalla tiene **una sola lista de productos** —nombre y precio en
 * córdobas, uno tras otro— y el contrato de la API no cambió: el **primer
 * producto** es la mercadería principal (`product_name` + `cost`) y los
 * siguientes viajan como `additional_items` con `kind: "merchandise"`, que es lo
 * que la factura ya agrupa bajo la mercadería principal. Este módulo es el único
 * lugar donde se hace ese reparto.
 *
 * Frontera de pureza (la misma de `sale-form.ts`): acá sólo hay listas y
 * strings, sin `document`. La vista (`lib/views/sale-new.ts`) lee los
 * controles y le pasa el arreglo.
 */

import type { AdditionalSaleKind, ICreateAdditionalSaleRequest } from "../core/types"
import { toCents } from "./payment"

export interface IRowFields {
  name: string
  total: string
  description?: string
  quantity?: string
}

export function toAdditionalItem(
  fields: IRowFields,
  kind: AdditionalSaleKind,
): ICreateAdditionalSaleRequest {
  const item: ICreateAdditionalSaleRequest = {
    name: fields.name,
    total: fields.total,
    kind,
  }
  const quantity = fields.quantity
  if (quantity !== undefined && quantity !== "") item.quantity = Number(quantity)
  const description = fields.description
  if (description !== undefined && description !== "") item.description = description
  return item
}

/**
 * Un producto de la lista de mercadería: lo único que pide cada renglón. La
 * descripción y la cantidad que tenían los renglones viejos no existen acá —
 * ofrecerlas y no imprimirlas en la factura sería una pérdida silenciosa (S44).
 */
export interface IProductRow {
  name: string
  /** El precio en córdobas tal como se escribió; se valida y se suma con `toCents`. */
  price: string
}

/** El renglón en blanco que clona «Agregar producto». */
export function emptyProductRow(): IProductRow {
  return { name: "", price: "" }
}

/**
 * La lista con la que abre el formulario: **un** producto. El primero no se
 * puede quitar porque es la mercadería principal de la venta (S44), así que la
 * lista nunca está vacía.
 */
export function initialProductRows(): IProductRow[] {
  return [emptyProductRow()]
}

/**
 * La suma estimada que pinta el resumen: **Mercadería** y **Total estimado** son
 * el mismo número porque ya no hay otras listas (S45). Un precio que todavía no
 * se puede leer se omite —la fila puede estar a medio llenar— y si ninguno se
 * puede leer devuelve `null`, que la pantalla pinta como «—» y no como cero.
 */
export function productRowsTotalCents(rows: readonly IProductRow[]): number | null {
  let cents = 0
  let readable = false
  for (const row of rows) {
    const value = toCents(row.price)
    if (value === null) continue
    cents += value
    readable = true
  }
  return readable ? cents : null
}

/** Los dos campos de un renglón, con el nombre que les da la API del formulario. */
export type TProductField = "name" | "total"

export interface IProductTarget {
  /** Índice en la lista de la pantalla, contando el primer producto. */
  index: number
  field: TProductField
}

const PRODUCT_FIELD = /^(?:items|additional_items)\.(\d+)\.(\w+)$/

/**
 * A qué renglón pertenece un error, para pintarlo sobre el control correcto.
 *
 * Tres vocabularios llegan acá y los tres tienen que caer en la misma fila:
 * - `product_name` / `cost`, que son los nombres del primer producto en el
 *   contrato (S45);
 * - `items.<n>.<campo>`, que son los de la validación de la pantalla y cuentan
 *   la lista completa, con el primer producto adentro;
 * - `additional_items.<j>.<campo>`, que son los del 400 del servidor y cuentan
 *   **sólo** los adicionales: por eso el corrimiento de uno.
 */
export function productFieldTarget(key: string): IProductTarget | null {
  if (key === "product_name") return { index: 0, field: "name" }
  if (key === "cost") return { index: 0, field: "total" }

  const match = PRODUCT_FIELD.exec(key)
  if (match === null) return null
  const [, rawIndex, rawField] = match
  if (rawField !== "name" && rawField !== "total") return null

  const index = Number(rawIndex)
  return {
    index: key.startsWith("additional_items.") ? index + 1 : index,
    field: rawField,
  }
}

/** El reparto de la lista entre la mercadería principal y los renglones de la factura. */
export interface IProductPayload {
  product_name: string
  cost: string
  /**
   * Sólo existe cuando hay más de un producto: una venta de un solo producto
   * manda el cuerpo de siempre, sin la clave.
   */
  additional_items?: ICreateAdditionalSaleRequest[]
}

/**
 * Arma el cuerpo de la venta desde la lista (S45). El orden de la lista es el del
 * payload y ese orden es el índice con el que el servidor señala el renglón que
 * falló. Los valores se recortan porque los espacios que se cuelan al escribir no
 * son parte del nombre ni del importe.
 */
export function productPayload(rows: readonly IProductRow[]): IProductPayload {
  // Sin filas —un estado imposible en pantalla, donde el primero siempre existe—
  // el cuerpo queda con los dos campos vacíos y la validación los reclama.
  const [first = emptyProductRow(), ...rest] = rows
  const payload: IProductPayload = {
    product_name: first.name.trim(),
    cost: first.price.trim(),
  }
  if (rest.length > 0) {
    payload.additional_items = rest.map((row) =>
      // `toAdditionalItem` es el mismo mapeo que usaban los renglones viejos: así
      // el renglón conserva su forma y no hay una segunda copia del contrato.
      toAdditionalItem({ name: row.name.trim(), total: row.price.trim() }, "merchandise"),
    )
  }
  return payload
}
