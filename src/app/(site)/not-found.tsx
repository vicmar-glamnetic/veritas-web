import { ButtonLink, Container } from '@/components/ui';

export default function NotFound() {
  return (
    <Container className="py-20 text-center">
      <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">
        Page not found
      </p>
      <h1 className="mt-3 text-2xl font-bold text-ink-900 sm:text-3xl">
        That page isn&rsquo;t here.
      </h1>
      <p className="mx-auto mt-3 max-w-md text-base text-ink-500">
        It may have moved, or the link may be an old one. Try from the home page instead.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/">Go to the home page</ButtonLink>
        <ButtonLink href="/contact" variant="secondary">
          Contact the clinic
        </ButtonLink>
      </div>
    </Container>
  );
}
