export interface EventData {
    event: string;
    type: 'track' | 'profile_set' | 'profile_set_once';
    properties: Record<string, any>;
    time: number;
    distinct_id: string;
    anonymous_id: string;
    login_id?: string;
    project_id?: string;
}
export interface Plugin {
    name: string;
    install: (sdk: any) => void;
}
