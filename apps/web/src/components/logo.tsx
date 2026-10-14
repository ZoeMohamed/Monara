import Image from "next/image";

// Use the supplied icon-and-wordmark lockup as one asset.
export function Logo() {
  return (
    <span className="inline-flex min-w-0 max-w-full">
      <Image
        alt="Monara"
        className="h-8 w-auto max-w-full object-contain sm:h-10 lg:h-9"
        height={142}
        loading="eager"
        src="/logos/monara-lockup-light.svg"
        width={704}
      />
    </span>
  );
}
