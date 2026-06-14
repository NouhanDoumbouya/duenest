from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    """
    Default page-number pagination that also lets a client request a smaller
    (or larger, up to a cap) page via ``?page_size=``.

    The default page size is unchanged (20), so existing callers are
    unaffected. Clients that only need a count or a handful of rows can pass a
    small ``page_size`` to avoid serializing a full page of heavy objects; the
    paginated ``count`` is always the full total regardless of page size.
    """

    page_size_query_param = "page_size"
    # Cap the page size so a client cannot force an unbounded response.
    max_page_size = 100
