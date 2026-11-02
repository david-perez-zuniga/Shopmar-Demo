/**
 * Los eventos con los que el router avisa al armazón.
 *
 * La SPA no reemplaza el documento, así que un componente del armazón que se
 * abre (el cajón de navegación) no se cierra solo al cambiar de vista: alguien
 * tiene que avisarle. El evento es el contrato más chico posible: el router no
 * conoce el cajón y el cajón no conoce el router.
 */

/** Se emite en el documento cada vez que el router monta una vista. */
export const APP_NAVIGATED = "shopmar:navigate"
