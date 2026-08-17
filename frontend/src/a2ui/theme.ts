import { defaultTheme, type A2UITheme } from 'a2ui-vue';

/** Map A2UI chrome to writing-studio tokens — roomier, calmer, no purple skin. */
export const studioA2UITheme: A2UITheme = {
  ...defaultTheme,
  additionalStyles: {
    ...(defaultTheme.additionalStyles || {}),
    Button: {
      background: '#e8e8e8',
      color: '#111111',
      borderRadius: '10px',
      boxShadow: 'none',
      textTransform: 'none',
      fontWeight: '650',
      fontSize: '12.5px',
      padding: '6px 12px',
      letterSpacing: '0',
      minHeight: '30px',
      height: '30px',
      lineHeight: '1',
    },
    Card: {
      background: 'transparent',
      border: 'none',
      borderRadius: '0',
      boxShadow: 'none',
      padding: '0',
    },
    Text: {
      h1: {
        color: 'var(--ink)',
        background: 'none',
        WebkitTextFillColor: 'unset',
        fontFamily: 'var(--font-display)',
        fontSize: '1.05rem',
        fontWeight: '700',
        letterSpacing: '-0.02em',
        lineHeight: '1.3',
        marginBottom: '4px',
      },
      h2: {
        color: 'var(--ink)',
        background: 'none',
        WebkitTextFillColor: 'unset',
        fontFamily: 'var(--font-display)',
        fontSize: '1rem',
        fontWeight: '700',
        letterSpacing: '-0.02em',
        lineHeight: '1.3',
        marginBottom: '4px',
      },
      h3: {
        color: 'var(--ink)',
        background: 'none',
        WebkitTextFillColor: 'unset',
        fontSize: '0.95rem',
        fontWeight: '650',
      },
      h4: {
        color: 'var(--muted)',
        fontWeight: '650',
        fontSize: '0.8125rem',
        marginTop: '8px',
        marginBottom: '2px',
      },
      h5: { color: 'var(--muted)' },
      body: { color: 'var(--text)', fontSize: '14px', lineHeight: '1.6' },
      caption: { color: 'var(--muted)', fontSize: '12.5px', lineHeight: '1.45' },
    },
    TextField: {
      '--p-0': 'var(--surface)',
      container: {
        marginBottom: '10px',
      },
      element: {
        borderRadius: '10px',
        padding: '9px 11px',
        border: '1px solid color-mix(in srgb, var(--line) 90%, transparent)',
        fontSize: '13px',
        fontFamily: 'inherit',
        lineHeight: '1.45',
        minHeight: '40px',
        background: 'color-mix(in srgb, var(--bg-0) 55%, var(--surface))',
        color: 'var(--ink)',
        boxShadow: 'none',
      },
      label: {
        color: 'var(--muted)',
        fontWeight: '650',
        fontSize: '12px',
        marginBottom: '6px',
      },
    },
    ChoicePicker: {
      container: {
        gap: '8px',
        display: 'grid',
      },
      element: {
        color: 'var(--ink)',
        borderRadius: '999px',
        padding: '8px 12px',
        border: '1px solid transparent',
        background: 'color-mix(in srgb, var(--bg-0) 85%, var(--surface))',
      },
      label: {
        color: 'var(--ink)',
        fontSize: '13px',
        lineHeight: '1.4',
      },
    },
    Column: {
      gap: '12px',
    },
    Row: {
      gap: '8px',
      marginTop: '8px',
    },
  },
};

export const A2UI_BASIC_CATALOG_ID = 'https://a2ui.org/specification/v0_9/basic_catalog.json';
