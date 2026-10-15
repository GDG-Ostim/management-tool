/** Encode the recipient so characters such as ? and # cannot become mail headers. */
export function EmailLink({ email }: { email: string }) {
  return <a className="email-link" href={`mailto:${encodeURIComponent(email).replace(/%40/g, '@')}`}
    onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} draggable={false}>{email}</a>;
}
