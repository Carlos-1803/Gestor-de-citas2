import { useEffect, useState } from "react";
import { savedPhoto } from "./gestion";

export default function ShopPhoto({photo,owner,alt=photo.kind}) {
  const [preview,setPreview] = useState(null);
  useEffect(() => {
    if (!photo.localPhoto) return;
    let active = true, url;
    savedPhoto(owner,photo.localPhoto).then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setPreview({key:photo.localPhoto,url});
    }).catch(() => {});
    return () => { active=false; if (url) URL.revokeObjectURL(url); };
  },[owner,photo.localPhoto]);
  const url = photo.url || (preview?.key === photo.localPhoto ? preview.url : null);
  return url ? <img src={url} alt={alt} /> : null;
}