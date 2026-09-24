/** Minúsculas y sin tildes, para que «porteria» encuentre «Portería». Conserva la longitud de un
 *  texto en NFC con letras latinas (cada letra con tilde vuelve a ocupar una posición). */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
