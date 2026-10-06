import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, Image, Platform, Share, Alert, TextInput, ActionSheetIOS } from 'react-native';
import { Text } from '../../../components/Text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../lib/auth';
import { enablePush, shouldPromptForPush } from '../../../lib/push';
import {
  fetchEvent, rsvpToEvent, cancelRsvp, fetchMyRsvps, fetchProfile, fetchEventReviews, submitReview,
  API_BASE, type ApiEvent, type ApiRsvp, type ApiProfile, type ApiEventReviews,
} from '../../../lib/api';
import { useOpenDirections } from '../../../lib/directions';
import { eventShareUrl } from '../../../lib/shareLinks';
import { formatEventDateTime } from '../../../lib/dateFormat';
import { colors, radius, spacing, TAP, elevation, type as t } from '../../../lib/theme';
import { Icon } from '../../../components/icons';
import { AppHeader } from '../../../components/AppHeader';
import * as Haptics from 'expo-haptics';
import { Badge, SectionTitle, Btn, Chip, FieldLabel, Press, Skeleton, EmptyState, ErrorState, inputStyle, inputFocusedStyle } from '../../../components/ui';
import { useAuthGate } from '../../../components/AuthGate';
import { YoureIn } from '../../../components/YoureIn';
import { momentFor } from '../../../lib/youreIn';
import { consumePendingIntent } from '../../../lib/guestState';
import { StarRating, StarInput } from '../../../components/Stars';
import { ReportSheet } from '../../../components/ReportSheet';
import { ModerationBanner } from '../../../components/ModerationBanner';
import { useBlockHost } from '../../../lib/useBlockHost';
import { hostBannerKind, isRsvpForbidden } from '../../../lib/moderation';


function startsToday(startsAt?: string | null): boolean {
  if (!startsAt) return false;
  const d = new Date(startsAt);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const { t: tr } = useTranslation('discover');
  const { t: trCommon } = useTranslation('common');
  const openDirectionsSheet = useOpenDirections();
  const { t: trSettings } = useTranslation('settings');
  const { t: trMod } = useTranslation('moderation');
  const blockHost = useBlockHost();
  const [reportOpen, setReportOpen] = useState(false);

  const [event, setEvent] = useState<ApiEvent | null>(null);
  const [loading, setLoading] = useState(true); // true = show spinner on initial load
  const [error, setError] = useState('');
  const [rsvp, setRsvp] = useState<ApiRsvp | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [rsvpError, setRsvpError] = useState('');
  // The "You're in." moment (phase 5), shown when an RSVP lands as going or waitlisted.
  const [moment, setMoment] = useState<'going' | 'waitlisted' | null>(null);
  const pushOfferPending = useRef(false);
  const { requireAuth, gateSheet } = useAuthGate();

  const [hostProfile, setHostProfile] = useState<ApiProfile | null>(null);
  const [reviewsCtx, setReviewsCtx] = useState<ApiEventReviews>({ myReview: null, host: null, venue: null, reviews: [] });
  const [reviewHostRating, setReviewHostRating] = useState(0);
  const [reviewVenueRating, setReviewVenueRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [commentFocused, setCommentFocused] = useState(false);

  // Reachable via replace() from the publish flow, where no history exists and
  // router.back() is a silent no-op — fall back to the feed so the back arrow
  // is never dead.
  const leaveDetail = useCallback(() => {
    if (router.canGoBack()) { router.back(); return; }
    router.replace('/(tabs)/discover' as never);
  }, [router]);

  const loadEvent = useCallback(() => {
    if (!id) return;
    setError('');
    fetchEvent(id)
      .then(setEvent)
      .catch(() => setError(tr('detail.loadError')))
      .finally(() => setLoading(false));
  }, [id, tr]);

  useEffect(() => { loadEvent(); }, [loadEvent]);

  // Load this user's existing RSVP so the button reflects reality on every
  // visit. Without this the screen always rendered "Join Party", so returning
  // to an event you'd already joined and tapping it hit a 409 instead of
  // offering to cancel.
  useEffect(() => {
    if (!id || auth.status !== 'authenticated') return;
    let cancelled = false;
    fetchMyRsvps()
      .then((rsvps) => {
        if (cancelled) return;
        const mine = rsvps.find((r) => r.eventId === id && r.state !== 'cancelled');
        if (mine) setRsvp(mine);
      })
      .catch(() => { /* non-fatal: falls back to the join state */ });
    return () => { cancelled = true; };
  }, [id, auth.status]);

  // Host identity for the "hosted by" row — the event payload only carries
  // hostId, so a follow-up profile fetch is needed for a display name.
  useEffect(() => {
    if (!event?.hostId) return;
    let cancelled = false;
    fetchProfile(event.hostId)
      .then((p) => { if (!cancelled) setHostProfile(p); })
      .catch(() => { /* non-fatal: row falls back to no name */ });
    return () => { cancelled = true; };
  }, [event?.hostId]);

  // Reviews context — host/venue aggregates, the caller's own review (if
  // any, to pre-fill the rate form in edit mode), and the public list.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchEventReviews(id)
      .then((ctx) => {
        if (cancelled) return;
        setReviewsCtx(ctx);
        if (ctx.myReview) {
          setReviewHostRating(ctx.myReview.hostRating);
          setReviewVenueRating(ctx.myReview.venueRating ?? 0);
          setReviewComment(ctx.myReview.comment ?? '');
        }
      })
      .catch(() => { /* non-fatal: rating sections just stay hidden */ });
    return () => { cancelled = true; };
  }, [id]);

  async function handleSubmitReview() {
    if (!event || reviewHostRating < 1) return;
    setReviewSubmitting(true);
    setReviewError('');
    try {
      const review = await submitReview({
        eventId: event.id,
        hostRating: reviewHostRating,
        venueRating: event.venueName ? (reviewVenueRating || null) : null,
        comment: reviewComment.trim() || null,
      });
      setReviewsCtx((prev) => ({
        ...prev,
        myReview: review,
        reviews: [review, ...prev.reviews.filter((r) => r.id !== review.id)],
      }));
    } catch (err) {
      const msg = (err as Error).message;
      setReviewError(msg || tr('detail.genericError'));
    } finally {
      setReviewSubmitting(false);
    }
  }

  // Guests get the sign-up sheet, titled with this party ("Sign up to RSVP for
  // Arsenal v Spurs"). `resume` is the post-sign-up completion of that same tap:
  // it only ever creates the RSVP, never toggles an existing one off.
  function openGate() {
    if (!id) return;
    requireAuth({ kind: 'rsvp', label: event?.title ?? '', eventId: id });
  }

  async function handleRsvp(resume = false) {
    if (auth.status !== 'authenticated') {
      openGate();
      return;
    }
    if (!event) return;

    setRsvpLoading(true);
    setRsvpError('');
    try {
      if (!resume && rsvp && rsvp.state !== 'cancelled') {
        await cancelRsvp(rsvp.id);
        setRsvp({ ...rsvp, state: 'cancelled' });
      } else {
        const newRsvp = await rsvpToEvent(event.id);
        setRsvp(newRsvp);
        // The one deliberate haptic in the app: a confirmed RSVP.
        if (newRsvp.state === 'going') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        // The signature moment. The push-permission offer waits until it is
        // dismissed (an Alert over a Modal does not present on iOS).
        if (momentFor(newRsvp.state, false)) {
          setMoment(newRsvp.state as 'going' | 'waitlisted');
          pushOfferPending.current = newRsvp.state === 'going';
        }
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'already_rsvpd') {
        // Server says an RSVP exists but our state disagrees — resync rather
        // than leave the user staring at an error they can't act on.
        const mine = await fetchMyRsvps()
          .then((rsvps) => rsvps.find((r) => r.eventId === event.id && r.state !== 'cancelled'))
          .catch(() => undefined);
        if (mine) setRsvp(mine);
        else setRsvpError(tr('detail.alreadyRsvpd'));
      } else if (msg === 'unauthorized') {
        openGate();
      } else if (isRsvpForbidden(err)) {
        // The host blocked this person. Say nothing about why.
        setRsvpError(tr('detail.rsvpForbidden'));
      } else {
        // Surface the real reason — a generic message here hid a
        // "Unsupported FormDataPart"-class bug on the cover upload for days.
        setRsvpError(msg || tr('detail.genericError'));
      }
    } finally {
      setRsvpLoading(false);
    }
  }

  // Dismissing the moment settles into the normal "Going" state underneath.
  // First time going: a natural moment to offer reminders (once per install;
  // the OS prompt only appears if they accept ours).
  function closeMoment() {
    setMoment(null);
    if (!pushOfferPending.current) return;
    pushOfferPending.current = false;
    shouldPromptForPush().then((ask) => {
      if (!ask) return;
      Alert.alert(trSettings('notifications.pushPromptTitle'), trSettings('notifications.pushPromptBody'), [
        { text: trSettings('notifications.pushPromptLater'), style: 'cancel' },
        { text: trSettings('notifications.pushPromptEnable'), onPress: () => { enablePush(); } },
      ]);
    });
  }

  // Share and the directions chooser are native sheets; they cannot present
  // over the Modal, so close the moment first and open them once it is gone.
  function afterMoment(action: () => void) {
    pushOfferPending.current = false;
    setMoment(null);
    setTimeout(action, 350);
  }

  // Finish the RSVP the guest started before signing up. Runs once the event
  // is loaded and the session is authenticated; the pending intent is consumed
  // so it can never fire twice.
  const resumeRsvp = useRef(handleRsvp);
  useEffect(() => { resumeRsvp.current = handleRsvp; });
  useEffect(() => {
    if (auth.status !== 'authenticated' || !event || !id) return;
    if (consumePendingIntent('rsvp', id)) resumeRsvp.current(true);
  }, [auth.status, event, id]);

  // ── Report / block (members only; never shown on your own party) ──────────
  function handleReport() {
    if (!id || !requireAuth({ kind: 'report', eventId: id })) return;
    setReportOpen(true);
  }

  function handleBlockHost() {
    if (!event) return;
    blockHost({ id: event.hostId, name: hostProfile?.displayName }, leaveDetail);
  }

  // From the report confirmation: close the page sheet first (a native action
  // sheet can't present over a Modal), then ask the block question.
  function blockAfterReport() {
    setReportOpen(false);
    setTimeout(handleBlockHost, 400);
  }

  function openMoreMenu() {
    const canBlock = auth.status === 'authenticated';
    const reportLabel = trMod('menu.report');
    const blockLabel = hostProfile
      ? trMod('menu.blockNamed', { name: hostProfile.displayName })
      : trMod('menu.blockHost');
    if (Platform.OS === 'ios') {
      const options = canBlock ? [reportLabel, blockLabel, trMod('cancel')] : [reportLabel, trMod('cancel')];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: canBlock ? 1 : undefined,
        },
        (i) => {
          if (i === 0) handleReport();
          else if (canBlock && i === 1) handleBlockHost();
        },
      );
    } else {
      Alert.alert(reportLabel, undefined, [
        { text: reportLabel, onPress: handleReport },
        ...(canBlock ? [{ text: blockLabel, style: 'destructive' as const, onPress: handleBlockHost }] : []),
        { text: trMod('cancel'), style: 'cancel' as const },
      ]);
    }
  }

  if (loading) {
    return (
      <View style={s.container}>
        <AppHeader back onBack={leaveDetail} />
        <View style={s.skeleton} accessibilityLabel={trCommon('loading')}>
          <Skeleton height={200} radius={radius.card} />
          <Skeleton width="30%" height={20} radius={radius.pill} />
          <Skeleton width="85%" height={30} />
          <Skeleton width="60%" height={16} />
          <Skeleton width="45%" height={16} />
          <Skeleton height={96} radius={radius.card} />
        </View>
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={s.container}>
        <AppHeader back onBack={leaveDetail} />
        {error ? (
          <ErrorState
            title={tr('detail.errorTitle')}
            message={error}
            retryLabel={trCommon('retry')}
            onRetry={() => { setLoading(true); loadEvent(); }}
          />
        ) : (
          <EmptyState
            icon="calendar"
            title={tr('detail.notFoundTitle')}
            body={tr('detail.notFound')}
            actionLabel={tr('detail.goBack')}
            onAction={leaveDetail}
          />
        )}
      </View>
    );
  }

  const { dateStr, timeStr } = event.startsAt
    ? formatEventDateTime(event.startsAt, event.venueTimezone)
    : { dateStr: null, timeStr: null };

  const rsvpState = rsvp?.state;
  const isGoing = rsvpState === 'going';
  const isWaitlisted = rsvpState === 'waitlisted';
  const isActive = isGoing || isWaitlisted;

  const rsvpBg = isGoing ? colors.confirmed : isWaitlisted ? colors.live : colors.action;
  const rsvpLabel = isGoing ? tr('detail.going') : isWaitlisted ? tr('detail.waitlisted') : tr('detail.joinParty');

  const coverSrc = event.coverImageUrl
    ? { uri: event.coverImageUrl.startsWith('/') ? `${API_BASE}${event.coverImageUrl}` : event.coverImageUrl }
    : null;

  const liveTonight = startsToday(event.startsAt);

  // Ended = endsAt in the past, or (no endsAt but startsAt already passed) —
  // same rule the RSVP/status logic above implicitly assumes an event stops
  // accepting new joins once it's over.
  const now = new Date();
  const hasEnded = event.endsAt
    ? new Date(event.endsAt) < now
    : event.startsAt
      ? new Date(event.startsAt) < now
      : false;
  const isHost = auth.status === 'authenticated' && auth.user.id === event.hostId;
  const canReview = hasEnded && isGoing && !isHost;

  const hostRatingLabel = reviewsCtx.host
    ? tr('detail.reviews.ratingSummary', { avg: reviewsCtx.host.avg.toFixed(1), count: reviewsCtx.host.count })
    : null;
  const venueRatingLabel = reviewsCtx.venue
    ? tr('detail.reviews.ratingSummary', { avg: reviewsCtx.venue.avg.toFixed(1), count: reviewsCtx.venue.count })
    : null;

  // STATUS tile — only real data: the viewer's own RSVP state, else capacity.
  const statusValue = isGoing
    ? tr('detail.going')
    : isWaitlisted
      ? tr('detail.waitlisted')
      : event.capacity != null
        ? tr('detail.capacity', { count: event.capacity })
        : null;
  const statusColor = isGoing ? colors.confirmed : isWaitlisted ? colors.live : colors.textPrimary;

  // Venue address masking — private locations never reveal the address here.
  const venueDetail = event.venueName
    ? event.isPrivateLocation
      ? `${tr('detail.privateLocation')}${isActive ? '' : ` ${tr('detail.shownAfterRsvp')}`}`
      : event.venueAddress
    : null;

  const hasDirectionTarget =
    (event.venueLat != null && event.venueLng != null) || !!event.venueAddress;
  const canShowDirections =
    hasDirectionTarget && (!event.isPrivateLocation || isActive);

  function openDirections() {
    if (!event) return;
    openDirectionsSheet({
      lat: event.venueLat,
      lng: event.venueLng,
      name: event.venueName,
      address: event.venueAddress,
    });
  }

  function handleShare() {
    if (!event) return;
    // A real https link, not the spotseek:// scheme — Messages/etc. only
    // linkify and preview http(s) URLs, and only a Universal Link can fall
    // back to a web page (with an Open Graph preview) when the recipient
    // doesn't have the app installed yet. See backend/src/deeplinks.ts.
    const link = eventShareUrl(event.id);
    const when = dateStr ? `${dateStr}${timeStr ? ` ${tr('detail.share.at')} ${timeStr}` : ''}` : null;
    // On iOS, `url` already produces the rich link preview — keep it out of
    // `message` there, or Messages' link-detector previews it a second time.
    const iosMessage = [event.title, when].filter(Boolean).join('\n');
    const androidMessage = [event.title, when, link].filter(Boolean).join('\n');
    Share.share(Platform.OS === 'ios' ? { message: iosMessage, url: link } : { message: androidMessage })
      .catch(() => {});
  }

  return (
    <View style={s.container}>
      <AppHeader back onBack={leaveDetail} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}>
        {/* Hero — cover photo, dimmed with the media scrim for legibility */}
        <View style={s.hero}>
          {coverSrc && (
            <Image source={coverSrc} style={StyleSheet.absoluteFill} resizeMode="cover" />
          )}
          <View style={[StyleSheet.absoluteFill, s.mediaDim]} />
          {!isHost && (
            <Press
              onPress={openMoreMenu}
              style={({ pressed }) => [s.shareBtn, s.moreBtn, pressed && s.pressed]}
              accessibilityRole="button"
              accessibilityLabel={trMod('menu.more')}
            >
              <Icon name="more" size={22} color={colors.textOnMedia} />
            </Press>
          )}
          <Press
            onPress={handleShare}
            style={({ pressed }) => [s.shareBtn, pressed && s.pressed]}
            accessibilityRole="button"
            accessibilityLabel={tr('detail.shareEvent')}
          >
            <Icon name="share" size={22} color={colors.textOnMedia} />
          </Press>
          <View style={s.heroContent}>
            <View style={s.heroBadges}>
              {liveTonight && <Badge label={tr('detail.liveTonight')} tone="live" />}
              <Badge label={event.broadcastSubject} tone="neutral" dot={false} />
            </View>
            <Text style={[t.headlineLg, { color: colors.textOnMedia }]}>{event.title}</Text>
          </View>
        </View>

        <View style={s.content}>
          {isHost && hostBannerKind(event.moderationStatus) && (
            <ModerationBanner kind={hostBannerKind(event.moderationStatus)!} />
          )}

          {/* Host row */}
          {hostProfile && (
            <View style={s.hostRow}>
              <Text style={[t.bodySm, { color: colors.textSecondary }]}>
                {tr('card.hostedBy', { name: hostProfile.displayName })}
              </Text>
              {hostRatingLabel && <StarRating value={reviewsCtx.host!.avg} size={13} label={hostRatingLabel} />}
            </View>
          )}

          {/* Meta tile grid */}
          <View style={s.tileRow}>
            <View style={s.tile}>
              <Text style={[t.labelSm, { color: colors.textSecondary }]}>{tr('detail.dateTime')}</Text>
              <Text style={[t.monoData, s.tileValue]}>
                {dateStr ? `${dateStr}${timeStr ? `\n${timeStr}` : ''}` : tr('detail.tba')}
              </Text>
            </View>
            {statusValue && (
              <View style={s.tile}>
                <Text style={[t.labelSm, { color: colors.textSecondary }]}>{tr('detail.status')}</Text>
                <Text style={[t.headlineMd, { color: statusColor }]} numberOfLines={1} adjustsFontSizeToFit>
                  {statusValue}
                </Text>
              </View>
            )}
          </View>

          {/* Venue card */}
          {event.venueName && (
            <View style={s.venueCard}>
              <Text style={[t.labelSm, { color: colors.textSecondary }]}>{tr('detail.venue')}</Text>
              <Text style={[t.bodyLg, { color: colors.textPrimary }]}>{event.venueName}</Text>
              {venueDetail && (
                <Text style={[t.monoData, { color: colors.textSecondary }]}>{venueDetail}</Text>
              )}
              {venueRatingLabel && <StarRating value={reviewsCtx.venue!.avg} size={13} label={venueRatingLabel} />}
              {canShowDirections && (
                <Press
                  style={({ pressed }) => [s.directionsBtn, pressed && s.pressed]}
                  onPress={openDirections}
                  accessibilityRole="button"
                >
                  <Text style={[t.label, { color: colors.action }]}>{tr('detail.getDirections')}</Text>
                </Press>
              )}
            </View>
          )}

          {/* Presented by — active sponsors, biggest bid first (array order) */}
          {event.sponsors != null && event.sponsors.length > 0 && (
            <View style={s.section}>
              <SectionTitle>{tr('detail.presentedBy')}</SectionTitle>
              <View style={s.sponsorChips}>
                {event.sponsors.map((sp, i) => (
                  <Chip key={`${sp.companyName}-${i}`} label={sp.companyName} active tone="confirmed" />
                ))}
              </View>
            </View>
          )}

          {/* The Breakdown */}
          {event.description && (
            <View style={s.section}>
              <SectionTitle>{tr('detail.breakdown')}</SectionTitle>
              <Text style={[t.bodyMd, { color: colors.textSecondary }]}>
                {event.description}
              </Text>
            </View>
          )}

          {/* Auth nudge */}
          {auth.status !== 'authenticated' && (
            <Press style={s.authNudge} onPress={openGate}>
              <Text style={[t.bodySm, { color: colors.textSecondary }]}>
                {tr('detail.authNudge')}
              </Text>
            </Press>
          )}

          {/* Rate this event — only once it's over, the caller actually went,
              and they aren't reviewing their own event. */}
          {canReview && (
            <View style={s.section}>
              <SectionTitle>{tr('detail.reviews.rateSection.title')}</SectionTitle>
              <View style={s.rateCard}>
                <View style={s.rateField}>
                  <FieldLabel>{tr('detail.reviews.rateSection.hostQuestion')}</FieldLabel>
                  <StarInput
                    value={reviewHostRating}
                    onChange={setReviewHostRating}
                    accessibilityLabel={tr('detail.reviews.hostLabel')}
                  />
                </View>
                {event.venueName && (
                  <View style={s.rateField}>
                    <FieldLabel>{tr('detail.reviews.rateSection.venueQuestion')}</FieldLabel>
                    <StarInput
                      value={reviewVenueRating}
                      onChange={setReviewVenueRating}
                      accessibilityLabel={tr('detail.reviews.venueLabel')}
                    />
                  </View>
                )}
                <View style={s.rateField}>
                  <TextInput
                    style={[inputStyle, s.textArea, commentFocused && inputFocusedStyle]}
                    placeholder={tr('detail.reviews.rateSection.commentPlaceholder')}
                    placeholderTextColor={colors.textTertiary}
                    value={reviewComment}
                    onChangeText={setReviewComment}
                    onFocus={() => setCommentFocused(true)}
                    onBlur={() => setCommentFocused(false)}
                    multiline
                    numberOfLines={4}
                    maxLength={1000}
                    textAlignVertical="top"
                  />
                </View>
                {reviewError ? (
                  <Text style={[t.bodySm, s.rsvpError]}>{reviewError}</Text>
                ) : null}
                <Btn
                  label={reviewsCtx.myReview
                    ? tr('detail.reviews.rateSection.update')
                    : tr('detail.reviews.rateSection.submit')}
                  onPress={handleSubmitReview}
                  disabled={reviewSubmitting || reviewHostRating < 1}
                />
              </View>
            </View>
          )}

          {/* Reviews list */}
          {reviewsCtx.reviews.length > 0 && (
            <View style={s.section}>
              <SectionTitle>{tr('detail.reviews.sectionTitle')}</SectionTitle>
              <View style={s.reviewList}>
                {reviewsCtx.reviews.map((r) => (
                  <View key={r.id} style={s.reviewRow}>
                    <View style={s.reviewHead}>
                      <Text style={[t.bodySm, { color: colors.textPrimary }]}>{r.reviewerName}</Text>
                      <Text style={[t.labelSm, { color: colors.textTertiary }]}>
                        {new Date(r.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <StarRating value={r.hostRating} size={13} />
                    {r.comment && (
                      <Text style={[t.bodySm, { color: colors.textSecondary }]}>{r.comment}</Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* RSVP bar */}
      <View style={[s.rsvpBar, { paddingBottom: insets.bottom + spacing.md }]}>
        {rsvpError ? (
          <Text style={[t.bodySm, s.rsvpError]}>{rsvpError}</Text>
        ) : null}
        <Press
          style={[s.rsvpBtn, { backgroundColor: rsvpBg }]}
          restOpacity={rsvpLoading ? 0.6 : 1}
          onPress={() => handleRsvp()}
          disabled={rsvpLoading}
          accessibilityRole="button"
        >
          {rsvpLoading ? (
            <ActivityIndicator color={colors.textOnFill} />
          ) : (
            <Text style={[t.button, { color: colors.textOnFill }]}>{rsvpLabel}</Text>
          )}
        </Press>
        {isActive && (
          <Press onPress={() => handleRsvp()} disabled={rsvpLoading} style={s.textLink} accessibilityRole="button">
            <Text style={[t.labelSm, s.cancelText]}>{tr('detail.cancelRsvp')}</Text>
          </Press>
        )}
      </View>

      {moment && (
        <YoureIn
          visible
          state={moment}
          title={event.title}
          when={dateStr ? `${dateStr}${timeStr ? ` ${tr('detail.share.at')} ${timeStr}` : ''}` : null}
          canGetDirections={canShowDirections}
          onShare={() => afterMoment(handleShare)}
          onDirections={() => afterMoment(openDirections)}
          onDone={closeMoment}
        />
      )}

      <ReportSheet
        visible={reportOpen}
        eventId={event.id}
        onClose={() => setReportOpen(false)}
        onBlockHost={blockAfterReport}
      />

      {gateSheet}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  skeleton: { padding: spacing.lg, gap: spacing.md },

  // Hero
  hero: {
    minHeight: 260,
    backgroundColor: colors.surface2,
    justifyContent: 'flex-end',
  },
  mediaDim: { backgroundColor: colors.mediaDim },
  shareBtn: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    width: TAP,
    height: TAP,
    backgroundColor: colors.mediaChip,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  moreBtn: { right: spacing.lg + TAP + spacing.sm },
  textLink: { minHeight: TAP, alignItems: 'center', justifyContent: 'center' },
  heroContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing['3xl'], gap: spacing.md },
  heroBadges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },

  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing.xl },

  // Meta tile grid
  tileRow: { flexDirection: 'row', gap: spacing.xs },
  tile: {
    flex: 1,
    backgroundColor: colors.surface1,
    padding: spacing.lg,
    gap: spacing.sm,
    justifyContent: 'space-between',
    borderRadius: radius.card,
  },
  tileValue: { color: colors.textPrimary },

  // Venue card
  venueCard: {
    backgroundColor: colors.surface1,
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radius.card,
  },
  directionsBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.actionWash,
    minHeight: TAP,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  pressed: { opacity: 0.82 },

  section: { gap: spacing.sm },
  sponsorChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  authNudge: {
    backgroundColor: colors.surface1,
    padding: spacing.lg,
    borderRadius: radius.card,
  },

  // RSVP bar
  rsvpBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    ...elevation(1),
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    shadowOffset: { width: 0, height: -2 },
    gap: spacing.sm,
  },
  rsvpBtn: { height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control },
  rsvpError: { color: colors.danger, textAlign: 'center' },
  cancelText: { color: colors.textTertiary, textAlign: 'center' },

  // Host row
  hostRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },

  // Rate this event
  rateCard: {
    backgroundColor: colors.surface1,
    padding: spacing.lg,
    gap: spacing.lg,
    borderRadius: radius.card,
  },
  rateField: { gap: spacing.sm },
  textArea: { minHeight: 96 },

  // Reviews list
  reviewList: { gap: spacing.md },
  reviewRow: {
    backgroundColor: colors.surface1,
    padding: spacing.lg,
    gap: spacing.xs,
    borderRadius: radius.card,
  },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
