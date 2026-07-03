import { useEffect } from 'react';

export interface MetaData {
  title: string;
  description: string;
  keywords?: string;
}

export function useMeta(path: string, metaData: MetaData) {
  useEffect(() => {
    // Update title
    document.title = metaData.title;

    // Update or create description meta tag
    let descriptionMeta = document.querySelector(
      'meta[name="description"]'
    ) as HTMLMetaElement | null;

    if (!descriptionMeta) {
      descriptionMeta = document.createElement('meta');
      descriptionMeta.name = 'description';
      document.head.appendChild(descriptionMeta);
    }

    descriptionMeta.content = metaData.description;

    // Update or create keywords meta tag
    if (metaData.keywords) {
      let keywordsMeta = document.querySelector(
        'meta[name="keywords"]'
      ) as HTMLMetaElement | null;

      if (!keywordsMeta) {
        keywordsMeta = document.createElement('meta');
        keywordsMeta.name = 'keywords';
        document.head.appendChild(keywordsMeta);
      }

      keywordsMeta.content = metaData.keywords;
    }

    // Update canonical URL
    let canonical = document.querySelector(
      'link[rel="canonical"]'
    ) as HTMLLinkElement | null;

    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }

    canonical.href = `https://example.com${path}`;

    // Update Open Graph tags (optional, for social sharing)
    updateOpenGraphTag('og:title', metaData.title);
    updateOpenGraphTag('og:description', metaData.description);
    updateOpenGraphTag('og:url', `https://example.com${path}`);
  }, [path, metaData]);
}

function updateOpenGraphTag(property: string, content: string) {
  let tag = document.querySelector(
    `meta[property="${property}"]`
  ) as HTMLMetaElement | null;

  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('property', property);
    document.head.appendChild(tag);
  }

  tag.content = content;
}
