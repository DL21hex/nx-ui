# «Ver como»: notas de integración

`view-as.ts` (`showViewAsBanner`) es un módulo sin elemento propio que usa `<nx-account>`: va en su
entrada (no con `import()`) y lo muestra mientras `viewAs` esté puesto. Sus estilos están en `view-as.css`, que importa `account.css`.

## `showViewAsBanner()`

- Franja fija arriba, de 36 px, en la capa superior (`popover="manual"`; sin Popover API queda con
  `position: fixed`). Vuelve a subir cuando se abre un popover de la librería (`nx-open-change`), así
  queda encima de un `<nx-dialog>` o del panel de la cuenta.
- Ámbar fuerte con texto oscuro en los dos temas (`light-dark()` propio, porque no existe
  `--nx-warning`; contraste de 8:1 o más), rayas diagonales tenues y un borde inferior marcado.
- Pone en `<html>` `--nx-view-as-offset: 36px` y `data-nx-view-as="{id}"`. `view-as.css` baja `body` con
  `padding-top: var(--nx-view-as-offset)`, y esa regla **reemplaza el `padding-top` propio del `body` de
  la app**. Un sidemenu o una barra fija de la app puede usar la misma variable:
  `top: var(--nx-view-as-offset, 0)`. El panel de la cuenta la resta de su alto disponible.
- `document.title` lleva el prefijo «[Ver como] ». Si la app cambia el título mientras tanto (una ruta
  nueva de una SPA), el prefijo vuelve (`MutationObserver` en `<head>`). Al quitar la franja se quita el
  prefijo del título que haya en ese momento.
- `role="region"` nombrada por la frase, y una región `role="status"` que la anuncia una vez. El nombre y
  el rol van siempre como texto (también un «$&» en los datos). Sin rol, « ({role})» desaparece de la
  plantilla.
- Textos: `banner` (`{name}` en negrita, `{role}`), `exit` y `title` (el prefijo), en los mismos
  `labels` de la cuenta.
- «Salir de ver como» solo llama `onExit`. En `<nx-account>` eso emite `nx-account-view-as` `{user:
  null}`, cancelable: si la app lo cancela (para terminar la suplantación en su servidor), la franja
  sigue hasta que asigne `viewAs = null`.

## Por qué no va en un chunk

Iba con `import()` y reintentos (1 s, 2 s… hasta 30 s), pero en el navegador se comprobó que Chromium
recuerda un `import()` fallido hasta recargar: con el chunk viejo en 404 (una pestaña abierta antes de
un despliegue), la franja no volvía nunca. Firefox sí lo vuelve a pedir. Ahora va en la entrada de la
cuenta. Si aun así no hay franja (`showViewAsBanner` lanzó), la cuenta lleva `data-view-as`,
`account.css` marca la tarjeta con un contorno ámbar oscuro (3:1 o más en los dos temas;
`html:not([data-nx-view-as]) nx-account[data-view-as]`) y su texto oculto dice «Viendo como {name}.».

## Lo no verificado

- La franja sobre un `<nx-dialog>` abierto, el orden en la capa superior frente a `nx-toaster` y
  `nx-keytips`, y el texto cortado con «…» en pantallas angostas.
- WebKit y un lector de pantalla real (el anuncio único de la región `status`).
