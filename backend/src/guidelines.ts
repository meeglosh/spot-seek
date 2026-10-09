/**
 * GET /guidelines: community guidelines + how reporting works + contact.
 * Uses the shared web page shell (same palette and type as the landing page).
 * Plain, short copy. No em dashes.
 */
import { escapeHtml, renderPage } from './webpage';
import { legalFooter, LEGAL_FOOT_CSS } from './legal';

export const GUIDELINES_CONTACT = 'hello@spotseek.app';

export function renderGuidelinesPage(opts: { baseUrl: string }): string {
  const base = escapeHtml(opts.baseUrl);
  const body = `<div class="content">
    <div class="label">Community guidelines</div>
    <h1>Keep it fun for everyone</h1>
    <p class="meta">SpotSeek is for watching things together. Every party should be somewhere anyone in the community feels safe walking into.</p>

    <div class="panel">
      <h2>What is not allowed</h2>
      <ul>
        <li>Hate: slurs, or attacks on people for who they are (race, religion, gender, sexuality, disability, nationality).</li>
        <li>Harassment, threats or bullying.</li>
        <li>Sexual content, or anything that sexualizes minors.</li>
        <li>Violence or content that encourages it.</li>
        <li>Spam, scams and fake parties.</li>
      </ul>
      <p class="fine">This applies to titles, descriptions, venue names, photos and chat.</p>
    </div>

    <div class="panel">
      <h2>How reporting works</h2>
      <p class="meta">Open any party in the app and tap Report. Pick a reason and add a note if you like. You can also block a host so you never see their parties.</p>
      <p class="meta">New parties are checked before they go live. If a report looks serious, or a few people report the same party, we hide it right away and then review it. The host is told their party is under review.</p>
      <p class="meta">If we take a party down, the host is told why. Hosts who repeatedly break the guidelines lose the ability to publish.</p>
    </div>

    <div class="panel panel-cyan">
      <h2>Contact us</h2>
      <p class="meta">Questions, appeals or something urgent? Email <a href="mailto:${GUIDELINES_CONTACT}">${GUIDELINES_CONTACT}</a>. We read every message.</p>
    </div>

    <p class="fine"><a href="${base}/">Back to SpotSeek</a></p>
  </div>
  ${legalFooter(opts.baseUrl)}`;
  return renderPage({
    title: 'Community guidelines · SpotSeek',
    head: '<meta name="description" content="What is and is not allowed on SpotSeek, how reporting works, and how to contact us.">\n' + LEGAL_FOOT_CSS,
    body,
  });
}
