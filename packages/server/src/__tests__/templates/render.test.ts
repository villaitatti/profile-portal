import { describe, it, expect, beforeEach } from 'vitest';

// Template renderer reads env.CLAIM_VIT_ID_URL + env.PORTAL_PUBLIC_URL at
// call time, not module-init, so we can mock env in the test harness.
vi.mock('../../env.js', () => ({
  env: {
    CLAIM_VIT_ID_URL: 'https://claim.test.example/claim-vit-id',
    PORTAL_PUBLIC_URL: 'https://portal.test.example',
  },
  isDevMode: false,
}));

import {
  renderVitIdInvitation,
  renderBioProjectDescription,
  TemplateRenderError,
  __resetTemplateCacheForTests,
} from '../../templates/render.js';
import { vi } from 'vitest';

beforeEach(() => {
  __resetTemplateCacheForTests();
});

describe('renderVitIdInvitation', () => {
  it('substitutes firstName and claimUrl into HTML + text', () => {
    const out = renderVitIdInvitation({ firstName: 'Sofia' });

    expect(out.subject).toBe('Welcome to I Tatti — Claim your VIT ID');

    // Both channels (HTML + plaintext) MUST carry the same substitutions —
    // a spam-filter that falls back to plaintext should see the same greeting
    // and the same link as the HTML reader.
    expect(out.html).toContain('Dear Sofia,');
    expect(out.text).toContain('Dear Sofia,');
    expect(out.html).toContain('https://claim.test.example/claim-vit-id');
    expect(out.text).toContain('https://claim.test.example/claim-vit-id');

    // Logo URL is built from PORTAL_PUBLIC_URL + known asset path.
    expect(out.html).toContain(
      'https://portal.test.example/itatti-logo-email.png'
    );
  });

  it('tolerates trailing slash on PORTAL_PUBLIC_URL', async () => {
    vi.resetModules();
    vi.doMock('../../env.js', () => ({
      env: {
        CLAIM_VIT_ID_URL: 'https://claim.test.example/claim-vit-id',
        PORTAL_PUBLIC_URL: 'https://portal.test.example/',
      },
      isDevMode: false,
    }));

    const mod = await import('../../templates/render.js');
    mod.__resetTemplateCacheForTests();
    const out = mod.renderVitIdInvitation({ firstName: 'Sofia' });
    expect(out.html).toContain(
      'https://portal.test.example/itatti-logo-email.png'
    );
    expect(out.html).not.toContain('//itatti-logo-email.png');
  });

  it('throws missing_first_name when firstName is blank or whitespace-only', () => {
    expect(() => renderVitIdInvitation({ firstName: '' })).toThrow(
      TemplateRenderError
    );
    expect(() => renderVitIdInvitation({ firstName: '   ' })).toThrow(
      TemplateRenderError
    );
    expect(() =>
      renderVitIdInvitation({ firstName: '' })
    ).toThrowError(/missing_first_name/);
  });

  it('reflects codex-finding-#1 reword — no "already created" phrasing', () => {
    const out = renderVitIdInvitation({ firstName: 'Sofia' });
    // The original pre-review copy was:
    //   "...which we have already created for you."
    // That claim contradicted claim.service.ts (which creates the Auth0
    // user on first claim). Both plaintext and HTML must carry the
    // corrected copy.
    expect(out.text).toContain('linked to this email address');
    expect(out.text).not.toMatch(/already created/i);
    expect(out.html).toContain('linked to this email address');
    expect(out.html).not.toMatch(/already created/i);
  });
});

describe('renderBioProjectDescription', () => {
  it('substitutes firstName into HTML + text', () => {
    const out = renderBioProjectDescription({ firstName: 'Marco' });

    expect(out.subject).toBe('Biography and Project Description');
    expect(out.html).toContain('Dear Marco,');
    expect(out.text).toContain('Dear Marco,');
  });

  it('falls back to "Appointee" when firstName is blank (preserves prior behavior)', () => {
    const out = renderBioProjectDescription({ firstName: '' });
    expect(out.html).toContain('Dear Appointee,');
    expect(out.text).toContain('Dear Appointee,');
  });

  it('preserves the JSM helpdesk URL verbatim from the prior plaintext path', () => {
    const out = renderBioProjectDescription({ firstName: 'Marco' });
    const jsmUrl =
      'https://helpdesk.itatti.harvard.edu/servicedesk/customer/portal/4/group/5/create/10';
    expect(out.html).toContain(jsmUrl);
    expect(out.text).toContain(jsmUrl);
  });

  it('preserves the example-profile URL from the prior plaintext path', () => {
    const out = renderBioProjectDescription({ firstName: 'Marco' });
    const exampleUrl =
      'https://itatti.harvard.edu/people/giovanni-vito-distefano';
    expect(out.html).toContain(exampleUrl);
    expect(out.text).toContain(exampleUrl);
  });
});

describe('HTML escaping guard (pre-ship finding)', () => {
  it('escapes <, >, &, " and \' in firstName for the HTML output ONLY', () => {
    // An admin pastes a name with HTML-unsafe characters into CiviCRM. The
    // recipient's inbox must see a correctly-rendered literal, not a
    // dangling tag or broken entity.
    const out = renderBioProjectDescription({
      firstName: 'O\'Brien <Smith & Jones> "test"',
    });

    // HTML: every unsafe char is encoded.
    expect(out.html).toContain(
      'O&#39;Brien &lt;Smith &amp; Jones&gt; &quot;test&quot;'
    );
    // Neither raw `<` nor raw `&` should reach HTML output alongside the
    // substitution — the raw `<` check below specifically targets the
    // substitution context, not the surrounding template markup.
    expect(out.html).not.toContain('<Smith');
    expect(out.html).not.toContain('& Jones');

    // Plaintext: characters pass through unescaped. Plaintext MIME is plain
    // text; entities would be rendered literally by the client (ugly).
    expect(out.text).toContain('O\'Brien <Smith & Jones> "test"');
  });

  it('VIT invitation also escapes firstName in HTML', () => {
    const out = renderVitIdInvitation({ firstName: 'Dangerous <evil>' });
    expect(out.html).toContain('Dear Dangerous &lt;evil&gt;,');
    expect(out.html).not.toContain('<evil>');
    expect(out.text).toContain('Dear Dangerous <evil>,');
  });
});

describe('compiled HTML style-attribute integrity (pre-ship finding)', () => {
  it('does not produce the broken `style="font-family:"` pattern that would strip body styling', () => {
    // Regression guard for the quoting bug that surfaced during pre-landing
    // review: when mj-all font-family used single-quoted outer with
    // double-quoted inner ('"brandon-grotesque", ...'), MJML inlined it as
    // `style="font-family:"` which terminated the attribute early and
    // orphaned every subsequent declaration. The fix is to use single-
    // quoted inner font names. This test asserts the output shape so the
    // bug cannot silently return.
    const out = renderVitIdInvitation({ firstName: 'Sofia' });
    // The early-termination pattern: `style="font-family:"` immediately
    // followed by whitespace + orphan attributes.
    expect(out.html).not.toMatch(/style="font-family:"\s/);
    // A well-formed font-family declaration has the closing `;` or `"`.
    expect(out.html).toMatch(
      /style="[^"]*font-family:[^"]*'brandon-grotesque'[^"]*;/
    );
  });
});
