import Constants from 'expo-constants';

// Public (publishable) test-mode key — safe to ship in the client. Also set in
// app.json `extra.stripePublishableKey`; the constant is the fallback.
const FALLBACK_PUBLISHABLE_KEY =
  'pk_test_51UNDiHLdvtHgxDqEjzepUk5FpS6b7IDeRUjHC5Q3O068UWRgl2RTwUSVIaF1kPVvnmtsFZr9sOKh3C5Lpc2sFd7r00T7jLRDRt';

export const STRIPE_PUBLISHABLE_KEY: string =
  (Constants.expoConfig?.extra?.stripePublishableKey as string | undefined) ?? FALLBACK_PUBLISHABLE_KEY;

export const STRIPE_MERCHANT_NAME = 'SpotSeek';
