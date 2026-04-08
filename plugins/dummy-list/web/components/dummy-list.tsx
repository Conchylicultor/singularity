import { Shell } from "@plugins/shell/web/commands";
import { dummyDetailPane } from "@plugins/dummy-detail/web/views";

const items = [
  { id: "1", label: "Alpha" },
  { id: "2", label: "Beta" },
  { id: "3", label: "Gamma" },
];

export function DummyList() {
  return (
    <div className="p-4">
      <h2 className="text-sm font-semibold mb-3">Items</h2>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              className="w-full text-left px-3 py-1.5 rounded hover:bg-accent text-sm"
              onClick={() => Shell.OpenPane(dummyDetailPane({ itemId: item.id, label: item.label }))}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
