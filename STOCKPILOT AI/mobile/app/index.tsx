import { Redirect } from 'expo-router';
import { useSessionStore } from '../src/stores/sessionStore';

export default function IndexRoute() {
  const hydrated = useSessionStore((s) => s.hydrated);
  const token = useSessionStore((s) => s.token);

  if (!hydrated || !token) {
    return <Redirect href="/(auth)/splash" />;
  }

  return <Redirect href="/(tabs)" />;
}
