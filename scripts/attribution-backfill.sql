-- 04AM attribution backfill — generated 2026-08-29 from the dry-run review.
-- Source of truth: https://claude.ai/code/artifact/06984904-9370-4d86-8361-53232eaff677
--
-- NOT APPLIED. Review the artifact first, then run this.
--
-- Only the rows marked confident in the review are here. The 19 flagged rows
-- are deliberately absent — they are left NULL until a human decides. A null
-- creator is honest; a wrong one is a liability.
--
-- `source` is never modified. attribution_parsed_at stamps every row written
-- here so a machine inference stays distinguishable from something typed.
--
-- Every assignment is coalesce(column, value): this fills EMPTY columns
-- only and can never overwrite. Added 2026-08-29 after found_via was
-- populated deterministically from URL hosts for 113 clips -- without
-- this, running the file would have silently replaced those, and would
-- have overwritten any creator typed by hand. Same rule as
-- attributionPatch() in lib/clips/attribution.ts, which is unit-tested.
--
-- To undo everything this does:
--   update public.clips set creator=null, rights_holder=null, found_via=null,
--     source_year=null, attribution_parsed_at=null
--   where attribution_parsed_at is not null;

begin;

create temp table _expected(source text) on commit drop;
insert into _expected(source) values
  ($q$032c$q$),
  ($q$A24$q$),
  ($q$apdirector.com$q$),
  ($q$Fonts in Use$q$),
  ($q$Secret Gang$q$),
  ($q$Abduzeedo$q$),
  ($q$Alasdair McLellan$q$),
  ($q$anOther Magazine$q$),
  ($q$AnOther Magazine, Comme des Garçons$q$),
  ($q$Aperture, Sung Jin Park (Aperture No. 260, "The Seoul Issue")$q$),
  ($q$blankxpression$q$),
  ($q$BonTemps Agency$q$),
  ($q$Collectors Weekly (Tumblr), Art Direction by Eiko Ishioka, via inspirationaljunkyard$q$),
  ($q$Colossal, Rich Wells$q$),
  ($q$Connor Willumsen, Éditions çà et là, 2023$q$),
  ($q$Connor Willumsen, ongoing web comic since Spring 2022$q$),
  ($q$Crashpad Art, Ty$q$),
  ($q$Dazed, Olivia Reavey$q$),
  ($q$Designspiration, Lars Müller Publishers$q$),
  ($q$Designspiration, MoMA Collection$q$),
  ($q$Designspiration, Saveframe.de$q$),
  ($q$Designspiration, Uurrss.tumblr.com$q$),
  ($q$Designspiration, via Flickr$q$),
  ($q$Designspiration, via Magazinewall.tumblr.com$q$),
  ($q$Dossier, i-D$q$),
  ($q$DUET, doss.world$q$),
  ($q$Epoch Review$q$),
  ($q$Fonts in Use, Landscape$q$),
  ($q$Fonts in Use, Mary & Jo$q$),
  ($q$Fonts in Use, Patryk Hardziej (Hardziej Studio)$q$),
  ($q$GIPHY, A. L. Crego$q$),
  ($q$GQ China, Ryley Paskal$q$),
  ($q$Heiri Cinema, sold via Bugbustle$q$),
  ($q$IMDb, written and directed by Greta Diaz Moreau$q$),
  ($q$Instagram, @alexdomingou$q$),
  ($q$Instagram, @peti__toth$q$),
  ($q$Instagram, @renatamotykav$q$),
  ($q$ISO50 Blog$q$),
  ($q$It's Nice That, Elliot Ulm (@elliotisacoolguy)$q$),
  ($q$Kalei NYC$q$),
  ($q$Lomography,  35mm_mistress$q$),
  ($q$magCulture$q$),
  ($q$Maven Creative, Molecular-Universe$q$),
  ($q$MoMA PS1$q$),
  ($q$Moshtix$q$),
  ($q$Norte Studio$q$),
  ($q$Paul Gacon$q$),
  ($q$PhotoVogue, Chiron Duong$q$),
  ($q$PhotoVogue, Jun Zhou$q$),
  ($q$PhotoVogue, Shijun Sun$q$),
  ($q$PhotoVogue, Sydney Patterson$q$),
  ($q$Refinery29$q$),
  ($q$Refinery29, @jilsanderpr$q$),
  ($q$Saint Laurent$q$),
  ($q$Self Service Magazine$q$),
  ($q$Sociotype$q$),
  ($q$The Index, Will Sanders$q$),
  ($q$typo/graphic posters, Erich Brechbühl (im schtei)$q$),
  ($q$Unsplash, Fumiaki Hayashi$q$),
  ($q$Vogue, A24$q$);

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$032c$q$),
  found_via = coalesce(found_via, $q$032c$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$032c$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$A24$q$),
  found_via = coalesce(found_via, $q$A24$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$A24$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Alexi Papalexopoulos$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, null),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$apdirector.com$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$Fonts in Use$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Fonts in Use$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$Secret Gang$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Secret Gang$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$Abduzeedo$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Abduzeedo$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Alasdair McLellan$q$),
  rights_holder = coalesce(rights_holder, $q$Ultimate Clothing Company$q$),
  found_via = coalesce(found_via, null),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Alasdair McLellan$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$AnOther Magazine$q$),
  found_via = coalesce(found_via, $q$AnOther Magazine$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$anOther Magazine$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$Comme des Garçons$q$),
  found_via = coalesce(found_via, $q$AnOther Magazine$q$),
  source_year = coalesce(source_year, 1989),
  attribution_parsed_at = now()
where source = $q$AnOther Magazine, Comme des Garçons$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Sung Jin Park$q$),
  rights_holder = coalesce(rights_holder, $q$Aperture$q$),
  found_via = coalesce(found_via, $q$Aperture$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Aperture, Sung Jin Park (Aperture No. 260, "The Seoul Issue")$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$blankxpression$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$blankxpression$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$BonTemps Agency$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, null),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$BonTemps Agency$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Eiko Ishioka$q$),
  rights_holder = coalesce(rights_holder, $q$Yasei Jidai$q$),
  found_via = coalesce(found_via, $q$Collectors Weekly (Tumblr)$q$),
  source_year = coalesce(source_year, 1976),
  attribution_parsed_at = now()
where source = $q$Collectors Weekly (Tumblr), Art Direction by Eiko Ishioka, via inspirationaljunkyard$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Rich Wells$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$Colossal$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Colossal, Rich Wells$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Connor Willumsen$q$),
  rights_holder = coalesce(rights_holder, $q$Éditions çà et là$q$),
  found_via = coalesce(found_via, null),
  source_year = coalesce(source_year, 2023),
  attribution_parsed_at = now()
where source = $q$Connor Willumsen, Éditions çà et là, 2023$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Connor Willumsen$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, null),
  source_year = coalesce(source_year, 2022),
  attribution_parsed_at = now()
where source = $q$Connor Willumsen, ongoing web comic since Spring 2022$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Ty$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$Crashpad Art$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Crashpad Art, Ty$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Olivia Reavey$q$),
  rights_holder = coalesce(rights_holder, $q$Dazed$q$),
  found_via = coalesce(found_via, $q$Dazed$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Dazed, Olivia Reavey$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$Lars Müller Publishers$q$),
  found_via = coalesce(found_via, $q$Designspiration$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Designspiration, Lars Müller Publishers$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Pierre Mendell$q$),
  rights_holder = coalesce(rights_holder, $q$Die Neue Sammlung$q$),
  found_via = coalesce(found_via, $q$Designspiration$q$),
  source_year = coalesce(source_year, 1993),
  attribution_parsed_at = now()
where source = $q$Designspiration, MoMA Collection$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Marcel Fleischmann$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$Designspiration$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Designspiration, Saveframe.de$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$Designspiration$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Designspiration, Uurrss.tumblr.com$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Josef Müller-Brockmann$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$Designspiration$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Designspiration, via Flickr$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$Brain Magazine$q$),
  found_via = coalesce(found_via, $q$Designspiration$q$),
  source_year = coalesce(source_year, 2013),
  attribution_parsed_at = now()
where source = $q$Designspiration, via Magazinewall.tumblr.com$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$i-D$q$),
  found_via = coalesce(found_via, $q$Dossier$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Dossier, i-D$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$Doss$q$),
  found_via = coalesce(found_via, $q$DUET$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$DUET, doss.world$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$Epoch Review$q$),
  found_via = coalesce(found_via, $q$Epoch Review$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Epoch Review$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Landscape$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$Fonts in Use$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Fonts in Use, Landscape$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Mary & Jo$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$Fonts in Use$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Fonts in Use, Mary & Jo$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Patryk Hardziej$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$Fonts in Use$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Fonts in Use, Patryk Hardziej (Hardziej Studio)$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$A. L. Crego$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$GIPHY$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$GIPHY, A. L. Crego$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Ryley Paskal$q$),
  rights_holder = coalesce(rights_holder, $q$GQ China$q$),
  found_via = coalesce(found_via, null),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$GQ China, Ryley Paskal$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$Heiri Cinema$q$),
  found_via = coalesce(found_via, $q$Bugbustle$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Heiri Cinema, sold via Bugbustle$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Greta Diaz Moreau$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$IMDb$q$),
  source_year = coalesce(source_year, 2025),
  attribution_parsed_at = now()
where source = $q$IMDb, written and directed by Greta Diaz Moreau$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$@alexdomingou$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$Instagram$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Instagram, @alexdomingou$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$@peti__toth$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$Instagram$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Instagram, @peti__toth$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$@renatamotykav$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$Instagram$q$),
  source_year = coalesce(source_year, 2026),
  attribution_parsed_at = now()
where source = $q$Instagram, @renatamotykav$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$ISO50 Blog$q$),
  source_year = coalesce(source_year, 1964),
  attribution_parsed_at = now()
where source = $q$ISO50 Blog$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Elliot Ulm$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$It's Nice That$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$It's Nice That, Elliot Ulm (@elliotisacoolguy)$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$Kalei NYC$q$),
  found_via = coalesce(found_via, $q$Kalei NYC$q$),
  source_year = coalesce(source_year, 2026),
  attribution_parsed_at = now()
where source = $q$Kalei NYC$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$35mm_mistress$q$),
  rights_holder = coalesce(rights_holder, $q$Lomography$q$),
  found_via = coalesce(found_via, $q$Lomography$q$),
  source_year = coalesce(source_year, 2020),
  attribution_parsed_at = now()
where source = $q$Lomography,  35mm_mistress$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$The-Art-Form$q$),
  found_via = coalesce(found_via, $q$magCulture$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$magCulture$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Maven Creative$q$),
  rights_holder = coalesce(rights_holder, $q$Molecular-Universe$q$),
  found_via = coalesce(found_via, null),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Maven Creative, Molecular-Universe$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$MoMA PS1$q$),
  found_via = coalesce(found_via, $q$MoMA PS1$q$),
  source_year = coalesce(source_year, 2026),
  attribution_parsed_at = now()
where source = $q$MoMA PS1$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$Listen Out$q$),
  found_via = coalesce(found_via, $q$Moshtix$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Moshtix$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Norte Studio$q$),
  rights_holder = coalesce(rights_holder, $q$Hermès$q$),
  found_via = coalesce(found_via, null),
  source_year = coalesce(source_year, 2024),
  attribution_parsed_at = now()
where source = $q$Norte Studio$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Paul Gacon$q$),
  rights_holder = coalesce(rights_holder, $q$Epoch$q$),
  found_via = coalesce(found_via, null),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Paul Gacon$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Chiron Duong$q$),
  rights_holder = coalesce(rights_holder, $q$Vogue$q$),
  found_via = coalesce(found_via, $q$PhotoVogue$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$PhotoVogue, Chiron Duong$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Jun Zhou$q$),
  rights_holder = coalesce(rights_holder, $q$Vogue$q$),
  found_via = coalesce(found_via, $q$PhotoVogue$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$PhotoVogue, Jun Zhou$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Shijun Sun$q$),
  rights_holder = coalesce(rights_holder, $q$Vogue$q$),
  found_via = coalesce(found_via, $q$PhotoVogue$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$PhotoVogue, Shijun Sun$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Sydney Patterson$q$),
  rights_holder = coalesce(rights_holder, $q$Vogue$q$),
  found_via = coalesce(found_via, $q$PhotoVogue$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$PhotoVogue, Sydney Patterson$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$Gucci$q$),
  found_via = coalesce(found_via, $q$Refinery29$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Refinery29$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$Jil Sander$q$),
  found_via = coalesce(found_via, $q$Refinery29$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Refinery29, @jilsanderpr$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$Saint Laurent$q$),
  found_via = coalesce(found_via, $q$Saint Laurent$q$),
  source_year = coalesce(source_year, 2026),
  attribution_parsed_at = now()
where source = $q$Saint Laurent$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$Self Service Magazine$q$),
  found_via = coalesce(found_via, $q$Self Service Magazine$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Self Service Magazine$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Sociotype$q$),
  rights_holder = coalesce(rights_holder, $q$Sociotype$q$),
  found_via = coalesce(found_via, null),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Sociotype$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Will Sanders$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$The Index$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$The Index, Will Sanders$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Erich Brechbühl$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$typo/graphic posters$q$),
  source_year = coalesce(source_year, 2022),
  attribution_parsed_at = now()
where source = $q$typo/graphic posters, Erich Brechbühl (im schtei)$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, $q$Fumiaki Hayashi$q$),
  rights_holder = coalesce(rights_holder, null),
  found_via = coalesce(found_via, $q$Unsplash$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Unsplash, Fumiaki Hayashi$q$ and archived_at is null;

update public.clips set
  creator = coalesce(creator, null),
  rights_holder = coalesce(rights_holder, $q$A24$q$),
  found_via = coalesce(found_via, $q$Vogue$q$),
  source_year = coalesce(source_year, null),
  attribution_parsed_at = now()
where source = $q$Vogue, A24$q$ and archived_at is null;

-- 60 source strings updated, 19 left for human review.
-- Check before committing:
--   select count(*) from clips where attribution_parsed_at is not null;
--   select found_via, count(*) from clips where archived_at is null group by 1 order by 2 desc;


-- Fail loudly rather than silently under-applying. If a source string here
-- does not exist in the database — a typo, a trailing space, an edit since
-- this was generated — the whole transaction aborts and nothing is written.
do $$
declare missing text[];
begin
  select array_agg(e.source) into missing
  from _expected e
  where not exists (
    select 1 from public.clips c
    where c.source = e.source and c.archived_at is null
  );
  if missing is not null then
    raise exception 'ABORTED — % source string(s) not found: %',
      array_length(missing,1), missing;
  end if;
  raise notice 'All 60 source strings matched. % clips stamped.',
    (select count(*) from public.clips where attribution_parsed_at is not null);
end $$;

commit;
