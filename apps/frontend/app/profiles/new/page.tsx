import ProfileForm from '@/components/ProfileForm';

export default function NewProfilePage() {
  return (
    <>
      <h1>New profile</h1>
      <p className="sub">Which AI model to use, your full profile in Markdown, and how the emails should read. API keys live in apps/backend/.env.</p>
      <ProfileForm />
    </>
  );
}
