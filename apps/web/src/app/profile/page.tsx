import { Suspense } from "react";

import { ProfilePageView } from "../../features/profile/components/profile-page-view";

export default function ProfilePage() {
  return (
    <main className="shell shell-auth">
      <Suspense fallback={null}>
        <ProfilePageView />
      </Suspense>
    </main>
  );
}
