# Pantalla bloqueada y «Ver como»: notas de integración

Dos módulos sin elemento propio que usa `<nx-account>`: `lock.ts` (`nxLock`) y `view-as.ts`
(`showViewAsBanner`). Los estilos de los dos están en `lock.css`.

## Lo que falta conectar

1. **CSS.** `lock.css` no está importado en ningún lado: agregarlo a `account.css` (o
   `@import "../components/account/lock.css";` en `src/styles/nx32-elements.css`) y, si se publica aparte, al
   presupuesto de `scripts/size.mjs`.
2. **Volver a bloquear tras recargar.** Si alguien recarga la página bloqueada, el bloqueo del cliente se
   pierde. `nxLock` deja un marcador en `sessionStorage` (`nx-locked`) mientras está bloqueada, y
   `lockedOnLoad()` lo lee (con `sessionStorage` roto devuelve `false`). En `connectedCallback` de
   `<nx-account>`:

   ```ts
   if (lockedOnLoad()) void nxLock({ user, endpoint, onLogout, labels, locale });
   ```

   El marcador también guarda los intentos fallidos y el fin de la espera: recargar no reinicia la espera.
3. **`onLogout`.** Lo normal es que navegue (`location.assign("/logout")`): la pantalla sigue tapando
   hasta que la página se va. Una SPA puede **devolver una promesa**: cuando se cumple (la app ya cambió
   su vista), la pantalla se quita y la promesa de `nxLock` se resuelve. Si `onLogout` lanza, o la página
   sigue ahí 10 s después, el botón se reactiva y la pantalla sigue bloqueada. Al pulsarlo se borra el
   marcador, para que la próxima sesión de la pestaña no arranque bloqueada. Sin `onLogout` no se pinta
   el botón.
4. **Otras piezas.** Con la pantalla bloqueada: `nx-lock-change` `{locked}` en `document`, y
   `html[data-nx-locked]`.

## `nxLock()`

- Un `<dialog>` al final de `body`, abierto con `showModal()`: el resto de la página queda inerte de
  forma nativa y los formularios de la app no se tocan. El diálogo mismo cubre la ventana con
  `--nx-canvas` al 80 % y `backdrop-filter: blur(28px)`; con `prefers-reduced-transparency` o sin
  `backdrop-filter` queda opaco. Sin `showModal` (happy-dom, navegadores viejos): `inert` en los hijos de
  `body` (también en los que se agregan después) y, al salir, se quita solo el que se puso. El `inert` que
  ya tenía un nodo se respeta.
- Escape no cierra: `cancel` cancelado, el `keydown` de Escape se cancela, y si el diálogo se cierra igual
  (el segundo Escape de Chrome, un `close()`), vuelve a abrirse. Si la app vacía `body`, el diálogo vuelve.
- Las teclas no llegan a los atajos de la app: se detienen en el diálogo, o en `window` si el foco está
  fuera. Así no pasan el Ctrl+Z de los avisos, la paleta de comandos ni el Escape o Tab de un
  `<nx-dialog>` abierto debajo, que cerraría lo que estaba a medio llenar. Tampoco sube `focusin`, para que
  la trampa de foco de `<nx-dialog>` no se lo lleve.
- `html[data-nx-locked] nx-toaster` queda oculto: un aviso que llega con la pantalla bloqueada
  (`raise()` lo pone en la capa superior) no se lee encima de ella.
- Verificación: `verify(password)` (solo `=== true` desbloquea), o `POST endpoint` con `{password}`,
  `credentials: "same-origin"`, `redirect: "error"` (si una sesión vencida redirige a un login que
  responde 200, eso no desbloquea) y `cache: "no-store"`. 2xx desbloquea; 401 o 403 es clave incorrecta;
  cualquier otra cosa, un error de red o que `verify` lance da «No se pudo verificar» y no cuenta como
  intento.
- **Sin `verify` ni `endpoint` válido** (`safeEndpoint`: mismo origen o `allowOrigins`), falla cerrado: el
  campo queda deshabilitado, no hay botón de desbloqueo, se avisa y solo queda «Cerrar sesión» (con
  `console.warn`). Sin `onLogout` tampoco, la pestaña queda bloqueada: es un error de configuración.
- Tras 5 intentos fallidos se espera 30 s, luego 60, 120… hasta 15 min (`lockWait`). La cuenta
  (`Desbloquear · 0:28`) va en el botón; el aviso `role="alert"` se dice una sola vez.
- Ocupado (verificando o esperando): el campo queda `readOnly` y el botón con `aria-disabled`, nunca
  `disabled`, porque el foco se perdería en `body`. Un segundo Enter no manda otra petición.
- Seguridad: la clave se lee y el campo se vacía **antes** de verificar. Nunca va a atributos, `dataset`,
  `sessionStorage` ni logs, y el diálogo se quita del DOM al desbloquear. El `<form>` es `method="post"`
  sin `action`: si el JS fallara, la clave no saldría en la URL. **Es un bloqueo de interfaz**: quien
  tenga las herramientas del navegador lo quita. La sesión real la protege el servidor: el endpoint debe
  exigir la cookie de sesión y limitar los intentos por su lado.
- Al desbloquear, el foco vuelve a donde estaba. Con View Transitions, la pantalla se funde con la app.
- Textos extra, opcionales y no rompen la firma: `error`, `wait` (`{s}`) y `unavailable`. `locked` lleva
  `{time}`, la hora en `locale`, o en el `lang` de `<html>`, o en «es-CO».
- Para el gestor de contraseñas: un `username` oculto con el correo, y `autocomplete="current-password"`.

## `showViewAsBanner()`

- Franja fija arriba, de 36 px, en la capa superior (`popover="manual"`; sin Popover API queda con
  `position: fixed`). Vuelve a subir cuando se abre un `<nx-dialog>` (`nx-open-change`), salvo con la
  pantalla bloqueada, que la tapa a propósito.
- Ámbar fuerte con texto oscuro en los dos temas (`light-dark()` propio, porque no existe
  `--nx-warning`; contraste de 8:1 o más), rayas diagonales tenues y un borde inferior marcado.
- Pone en `<html>` `--nx-view-as-offset: 36px` y `data-nx-view-as="{id}"`. `lock.css` baja `body` con
  `padding-top: var(--nx-view-as-offset)`, y esa regla **reemplaza el `padding-top` propio del `body` de
  la app**. Un sidemenu o una barra fija de la app puede usar la misma variable:
  `top: var(--nx-view-as-offset, 0)`.
- `document.title` lleva el prefijo «[Ver como] ». Si la app cambia el título mientras tanto (una ruta
  nueva de una SPA), el prefijo vuelve (`MutationObserver` en `<head>`). Al quitar la franja se quita el
  prefijo del título que haya en ese momento.
- `role="region"` nombrada por la frase, y una región `role="status"` que la anuncia una vez. El nombre y
  el rol van siempre como texto. Sin rol, « ({role})» desaparece de la plantilla.
- Texto extra opcional: `title`, el prefijo. «Salir de ver como» solo llama `onExit`: la app decide
  cuándo quitar la franja.

## Pesos (min + gzip, con el núcleo que arrastran)

| Pieza | Peso | Presupuesto |
| --- | --- | --- |
| `lock.ts` | 3,30 KB (3384 B) | 3,5 KB |
| `view-as.ts` | 1,25 KB (1280 B) | 1,5 KB |
| `lock.css` | 1,50 KB (1532 B) | 1,5 KB |

Para entrar en el presupuesto, los íconos (candado y ojo) son SVG constantes propios en vez de `glyph()`,
que arrastra el registro de íconos (unos 450 B), y la hora sale de `toLocaleTimeString` en vez de
`resolveLocale`. El CSS no tiene margen: cualquier regla nueva lo pasa.

## Lo no verificado (sin navegador)

Las pruebas corren en happy-dom (36 casos). No se probó en un navegador real:

- Que el segundo Escape de Chrome (CloseWatcher) cierre el diálogo y este se vuelva a abrir sin
  parpadeo, ni que cancelar el `keydown` baste para que no llegue a cerrarse.
- El desenfoque (`backdrop-filter` sobre un elemento de la capa superior), la legibilidad del fondo, los
  contrastes reales (`npm run contrast` no cubre estas piezas) y el modo oscuro.
- El fundido de View Transitions al desbloquear, y la sacudida del campo.
- La franja sobre un `<nx-dialog>` abierto, el orden en la capa superior frente a `nx-toaster` y
  `nx-keytips`, y el texto cortado con «…» en pantallas angostas.
- El comportamiento de los gestores de contraseñas con el `username` oculto.
- Los detectores en captura de `document` o `window` (`nx-scan` en modo `wedge="page"`, `nx-kanban`,
  `nx-tour`) todavía reciben teclas con la pantalla bloqueada si se registraron antes. Con el foco dentro
  del diálogo no deberían actuar, pero no está probado.
