import { createSignal, Show } from "solid-js";
import { Grid } from "../../dist/solid/grid.jsx";

export const [bulk, setBulk] = createSignal(true);

export function Page() {
  return (
    <main>
      <Grid columns={[{ key: "a", label: "A" }]} rows={[{ id: 1, a: "x" }, { id: 2, a: "y" }]} selectable locale="es-CO">
        <Show when={bulk()}>
          <button slot="bulk" class="autor">Aprobar</button>
        </Show>
      </Grid>
    </main>
  );
}
