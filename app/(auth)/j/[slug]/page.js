import { StudentLogin } from './StudentLogin';

export const metadata = { title: 'دخول الطلاب — المتابع الإيماني' };

export default async function JoinPage({ params }) {
  const { slug } = await params;
  return <StudentLogin slug={slug} />;
}
