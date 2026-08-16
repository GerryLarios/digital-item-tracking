CREATE VIEW `library_node_summary` AS 
    select
      n."id",
      n."media_type",
      n."display_name",
      n."description",
      n."status",
      n."release_year",
      n."nsfw",
      n."hidden",
      n."created_at",
      n."updated_at",
      (
        select json_group_array(provider)
        from (
          select distinct r."provider" as provider
          from "external_refs" as r
          where r."node_id" = n."id" and r."is_active" = 1
          order by provider
        )
      ) as "providers_json",
      (
        select json_group_array(medium)
        from (
          select distinct s."medium" as medium
          from "storage_locations" as s
          where s."node_id" = n."id" and s."is_active" = 1
          order by medium
        )
      ) as "mediums_json",
      exists (
        select 1
        from "external_refs" as r, json_each(r."list_memberships") as membership
        where r."node_id" = n."id" and r."is_active" = 1 and membership."value" = 'wishlist'
      ) as "is_wishlisted",
      (
        select i."id"
        from "images" as i
        where i."node_id" = n."id" and i."role" = 'main'
        order by i."sort_order" asc, i."id" asc
        limit 1
      ) as "main_image_id",
      (
        select i."id"
        from "images" as i
        where i."node_id" = n."id" and i."role" = 'thumbnail'
        order by i."sort_order" asc, i."id" asc
        limit 1
      ) as "thumbnail_image_id",
      coalesce(
        (
          select cast(a."value" as real)
          from "node_attributes" as a
          where a."node_id" = n."id" and a."key" = 'score' and a."source_provider" = 'mal'
          limit 1
        ),
        (
          select cast(a."value" as real) / 10.0
          from "node_attributes" as a
          where a."node_id" = n."id" and a."key" = 'metacriticScore' and a."source_provider" = 'steam'
          limit 1
        )
      ) as "rating"
    from "nodes" as n
  ;