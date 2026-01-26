export interface HeatmapConfig {
    clickmap?: 'default' | 'not_collect';
    scroll_notice_map?: 'default' | 'not_collect';
    collect_tags?: Record<string, boolean | {
        max_level: number;
    }>;
    collect_element?: (element: HTMLElement) => boolean;
    custom_property?: (element: HTMLElement) => Record<string, any> | undefined;
    loadTimeout?: number;
    collect_input?: (element: HTMLElement) => boolean;
    element_selector?: 'not_use_id' | 'default';
    renderRefreshTime?: number;
    request_timeout?: number;
    get_vtrack_config?: boolean;
    collect_url?: () => boolean;
    track_attr?: string[];
    scroll_delay_time?: number;
    scroll_event_duration?: number;
}
export interface SDKConfig {
    server_url: string;
    show_log?: boolean;
    is_track_single_page?: boolean;
    use_client_time?: boolean;
    send_type?: 'beacon' | 'ajax' | 'image' | 'sls';
    heatmap?: HeatmapConfig;
    web_url?: string;
    cross_subdomain?: boolean;
    source_channel?: string[];
    source_type?: Record<string, any>;
    max_string_length?: number;
    queue_timeout?: number;
    datasend_timeout?: number;
    preset_properties?: Record<string, any>;
    sls?: SLSConfig;
    debug?: boolean;
    autoTrack?: boolean;
    disablePageview?: boolean;
    disableClick?: boolean;
    disableStay?: boolean;
}
export interface SLSConfig {
    project: string;
    logstore: string;
    region?: string;
    endpoint?: string;
    method?: 'get' | 'post';
}
export declare const DEFAULT_CONFIG: Partial<SDKConfig>;
