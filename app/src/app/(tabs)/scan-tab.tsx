import { Redirect } from 'expo-router';

// Placeholder route for the center tab; its button opens the /scan modal instead.
export default function ScanTab() {
  return <Redirect href="/scan" />;
}
