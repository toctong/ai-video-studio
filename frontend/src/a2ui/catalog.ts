import { DEFAULT_CATALOG, type Catalog, type CatalogEntry } from 'a2ui-vue';
import ForcedChipsChoicePicker from './ForcedChipsChoicePicker.vue';

type ChoiceEntry = Extract<CatalogEntry, { type: unknown; props?: Function }>;

const baseChoice = DEFAULT_CATALOG.ChoicePicker as ChoiceEntry;

/** Replace dropdown ChoicePicker with in-flow chips (dialog overflow safe). */
export const assembleCatalog: Catalog = {
  ...DEFAULT_CATALOG,
  ChoicePicker: {
    type: () => ForcedChipsChoicePicker,
    props: (node) => {
      const fromBase =
        typeof baseChoice === 'object' && typeof baseChoice.props === 'function'
          ? baseChoice.props(node)
          : {
              options: (node as { properties?: Record<string, unknown> }).properties?.options ?? [],
              value: (node as { properties?: Record<string, unknown> }).properties?.value,
              label: (node as { properties?: Record<string, unknown> }).properties?.label,
              variant: (node as { properties?: Record<string, unknown> }).properties?.variant,
              filterable: (node as { properties?: Record<string, unknown> }).properties?.filterable,
            };
      const options = (fromBase as { options?: unknown[] }).options;
      const nodeProps = (node as { properties?: Record<string, unknown> }).properties || {};
      const displayStyle =
        (fromBase as { displayStyle?: string }).displayStyle ||
        (typeof nodeProps.displayStyle === 'string' ? nodeProps.displayStyle : undefined) ||
        'chips';
      return {
        ...fromBase,
        displayStyle,
        filterable:
          (fromBase as { filterable?: boolean }).filterable ??
          nodeProps.filterable ??
          (Array.isArray(options) && options.length > 12),
      };
    },
  },
};
