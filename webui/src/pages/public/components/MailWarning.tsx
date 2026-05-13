export function MailWarning({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-800 shadow-soft">
      服务器还没有配置发件邮箱。请先打开{' '}
      <a href="/admin" className="font-semibold underline">
        Admin
      </a>{' '}
      完成 SMTP 配置，否则无法实际发送邮件。
    </div>
  );
}
