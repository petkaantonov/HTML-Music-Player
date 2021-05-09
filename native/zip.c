#include <wasm.c>
#include <musl/time/mktime.c>


#define MINIZ_LITTLE_ENDIAN 1
#define MINIZ_USE_UNALIGNED_LOADS_AND_STORES 0

struct stat {
  time_t st_mtime;
};

extern int js_stat(const char* filename, double* st_mtime);
int stat(const char* filename, struct stat* st);
int stat(const char* filename, struct stat* st) {
    double m_time;
    int ret = js_stat(filename, &m_time);
    if (!ret) {
        if (st) {
            st->st_mtime = DOUBLE_TO_U64(m_time);
        }
    }
    return ret;
}


#include <zip/miniz.c>

extern void initialize(int, int, int);
static uintptr_t heapStart;
static int errNo;

static char* EMPTY_STRING = "";

typedef struct {
    bool is_directory;
    bool is_supported;
    char* name;
    time_t last_modified;
    size_t index;
    uint64_t size;
} ZipperFileInfo;

typedef struct {
    bool file_prepared;
    ZipperFileInfo* file_infos;
    size_t file_info_count;
    mz_zip_archive* miniz;
    uint32_t data_length;
    uint8_t* data_ptr;
} Zipper;


EXPORT mz_zip_error zipper_get_nth_file_info_fields(Zipper* zipper, size_t index,
        uint32_t* is_directory, uint32_t* is_supported, char** name, double* last_modified,
        double* size, size_t* retval_index, ZipperFileInfo** entry_ptr) ;
EXPORT mz_zip_error zipper_extract_file(Zipper* zipper, ZipperFileInfo* file_info);
static size_t write_callback(void* file_handle, uint64_t file_offset, const void* buffer, size_t buffer_length);
EXPORT mz_zip_error zipper_populate_file_infos(Zipper* zipper, size_t* file_info_count);
EXPORT mz_zip_error zipper_prepare_file_for_reading(Zipper* zipper, const char *pFilename);
EXPORT Zipper* init_zipper(void);
EXPORT const char* zipper_error_string(Zipper* zipper, mz_zip_error);
EXPORT mz_zip_error zipper_prepare_file_for_writing(Zipper* zipper);
EXPORT mz_zip_error zipper_add_file_to_archive(Zipper* zipper, const char* archive_name, const char* file_name,
                                              uint32_t compression_level);
EXPORT mz_zip_error zipper_finish_archive(Zipper* zipper);
EXPORT mz_zip_error zipper_finish_writing(Zipper* zipper);
EXPORT mz_zip_error zipper_get_data(Zipper* zipper, uint8_t** data_ptr_result, uint32_t* data_length_result);
static void zipper_clear_data(Zipper* zipper);

EXPORT int _start() {
    // Sanity checks
    uint8_t bytes[10];
    for (int i = 0; i < 10; ++i) {
        bytes[i] = i;
    }

    if (*((uint32_t*)(&bytes[4])) != 117835012) {
        printf("buggy wasm compiler");
        abort();
    }

    int dummy;
    heapStart = (uintptr_t)(&dummy) + (uintptr_t)(4);
    initialize(heapStart, DEBUG, STACK_SIZE);
    return 0;
}

EXPORT int* __errno_location() {
    return &errNo;
}

static void zipper_clear_data(Zipper* zipper) {
    if (zipper->file_info_count > 0) {
        for (int i = 0; i < zipper->file_info_count; ++i) {
            ZipperFileInfo* file_info = &zipper->file_infos[i];
            if (file_info->name != EMPTY_STRING) {
                free(file_info->name);
            }
            file_info->name = 0;
        }
        free(zipper->file_infos);
        zipper->file_infos = 0;
        zipper->file_info_count = 0;
    }
    mz_zip_zero_struct(zipper->miniz);
    zipper->file_prepared = false;
    zipper->file_infos = 0;
    zipper->file_info_count = 0;
}

EXPORT mz_zip_error zipper_finish_reading(Zipper* zipper) {
    if (!mz_zip_reader_end(zipper->miniz)) {
        return mz_zip_peek_last_error(zipper->miniz);
    }
    return MZ_ZIP_NO_ERROR;
}

EXPORT const char* zipper_error_string(Zipper* zipper, mz_zip_error err) {
    return mz_zip_get_error_string(err);
}

EXPORT Zipper* init_zipper() {
    Zipper* zipper = malloc(sizeof(Zipper));
    if (!zipper) {
        goto free_zipper;
    }
    zipper->file_prepared = false;
    zipper->file_infos = 0;
    zipper->file_info_count = 0;
    mz_zip_archive* miniz = malloc(sizeof(mz_zip_archive));
    if (!miniz) {
        goto free_miniz;
    }
    zipper->miniz = miniz;

    zipper->data_length = 1024 * 1024 * 2;
    zipper->data_ptr = malloc(zipper->data_length);
    if (!zipper->data_ptr) {
        goto free_data_ptr;
    }

    return zipper;

    free_data_ptr:
        free(zipper->data_ptr);
        zipper->data_ptr = 0;
    free_miniz:
        free(zipper->miniz);
        zipper->miniz = 0;
    free_zipper:
        free(zipper);
        zipper = 0;

    return 0;
}

EXPORT mz_zip_error zipper_prepare_file_for_reading(Zipper* zipper, const char *pFilename) {
    zipper_clear_data(zipper);
    if (!mz_zip_reader_init_file(zipper->miniz, pFilename, MZ_ZIP_FLAG_DO_NOT_SORT_CENTRAL_DIRECTORY)) {
        return mz_zip_peek_last_error(zipper->miniz);
    }

    zipper->file_prepared = true;
    return MZ_ZIP_NO_ERROR;
}


EXPORT mz_zip_error zipper_populate_file_infos(Zipper* zipper, size_t* file_info_count) {
    *file_info_count = 0;
    if (!zipper->file_prepared) {
        return MZ_ZIP_INVALID_PARAMETER;
    }

    if (zipper->file_info_count > 0) {
        return MZ_ZIP_INVALID_PARAMETER;
    }

    size_t total_files = mz_zip_reader_get_num_files(zipper->miniz);
    if (total_files == 0) {
        return MZ_ZIP_NO_ERROR;
    }

    ZipperFileInfo* file_infos = malloc(total_files * sizeof(ZipperFileInfo));

    if (!file_infos) {
        return MZ_ZIP_ALLOC_FAILED;
    }

    zipper->file_infos = file_infos;
    zipper->file_info_count = total_files;

    mz_zip_archive_file_stat stat;
    for (size_t index = 0; index < total_files; ++index) {
        ZipperFileInfo* file_info = &zipper->file_infos[index];
        file_info->index = index;

        if (!mz_zip_reader_file_stat(zipper->miniz, index, &stat)) {
            return mz_zip_peek_last_error(zipper->miniz);
        }

        file_info->size = stat.m_uncomp_size;
        file_info->last_modified = stat.m_time;
        file_info->is_directory = stat.m_is_directory;
        file_info->is_supported = stat.m_is_supported;

        int name_length = strlen((const char*)&stat.m_filename);
        if (!name_length) {
            file_info->name = EMPTY_STRING;
        } else {
            char* name = malloc(name_length + 1);
            if (!name) {
                return MZ_ZIP_ALLOC_FAILED;
            }
            memcpy(name, &stat.m_filename, name_length);
            name[name_length] = '\0';
            file_info->name = name;
        }
    }

    *file_info_count = zipper->file_info_count;
    return MZ_ZIP_NO_ERROR;
}

EXPORT mz_zip_error zipper_get_nth_file_info_fields(Zipper* zipper, size_t index,
        uint32_t* is_directory, uint32_t* is_supported, char** name, double* last_modified,
        double* size, size_t* retval_index, ZipperFileInfo** entry_ptr) {
    if (!zipper->file_prepared) {
        return MZ_ZIP_INVALID_PARAMETER;
    }

    if (index >= zipper->file_info_count) {
        return MZ_ZIP_INVALID_PARAMETER;
    }

    ZipperFileInfo* entry = &zipper->file_infos[index];
    *is_directory = entry->is_directory;
    *is_supported = entry->is_supported;
    *name = entry->name;
    *last_modified = CLIP_I64_TO_DOUBLE(entry->last_modified);
    *size = CLIP_I64_TO_DOUBLE(entry->size);
    *retval_index = entry->index;
    *entry_ptr = entry;
    return MZ_ZIP_NO_ERROR;
}


extern size_t js_write_callback(Zipper* zipper,
                                double file_offset,
                                const void* buffer,
                                size_t buffer_length,
                                uint8_t* data_ptr,
                                uint32_t data_length);

static size_t write_callback(void* zipper_opaque, uint64_t file_offset, const void* buffer, size_t buffer_length) {
    double file_offset_d = CLIP_I64_TO_DOUBLE(file_offset);
    Zipper* zipper = (Zipper*) zipper_opaque;
    return js_write_callback(zipper, file_offset_d, buffer, buffer_length, zipper->data_ptr, zipper->data_length);
}

EXPORT mz_zip_error zipper_extract_file(Zipper* zipper, ZipperFileInfo* file_info) {
    if (file_info->size > zipper->data_length) {
        if (file_info->size >= UINT_MAX) {
            return MZ_ZIP_ALLOC_FAILED;
        }

        zipper->data_length = 0;
        void* realloced = realloc(zipper->data_ptr, (uint32_t) file_info->size);
        if (!realloced) {
            free(zipper->data_ptr);
            zipper->data_ptr = 0;
            return MZ_ZIP_ALLOC_FAILED;
        }
        zipper->data_ptr = realloced;
        zipper->data_length = (uint32_t) file_info->size;
    }

    if (!mz_zip_reader_extract_to_callback(zipper->miniz, file_info->index, write_callback, zipper, MZ_ZIP_FLAG_DO_NOT_SORT_CENTRAL_DIRECTORY)) {
        return mz_zip_peek_last_error(zipper->miniz);
    }
    return MZ_ZIP_NO_ERROR;
}

EXPORT mz_zip_error zipper_prepare_file_for_writing(Zipper* zipper) {
    zipper_clear_data(zipper);

    zipper->miniz->m_pWrite = write_callback;
    zipper->miniz->m_pIO_opaque = zipper;

    if (!mz_zip_writer_init_v2(zipper->miniz, 0ULL, MZ_ZIP_FLAG_WRITE_ZIP64)) {
        return mz_zip_peek_last_error(zipper->miniz);
    }

    zipper->file_prepared = true;
    return MZ_ZIP_NO_ERROR;
}

EXPORT mz_zip_error zipper_add_file_to_archive(Zipper* zipper, const char* archive_name, const char* file_name,
                                               uint32_t compression_level) {
    compression_level = MAX(0, MIN(10, compression_level));
    if (!mz_zip_writer_add_file(zipper->miniz, archive_name, file_name, NULL, 0, compression_level)) {
        return mz_zip_peek_last_error(zipper->miniz);
    }
    return MZ_ZIP_NO_ERROR;
}

EXPORT mz_zip_error zipper_finish_archive(Zipper* zipper) {
    if (!mz_zip_writer_finalize_archive(zipper->miniz)) {
        return mz_zip_peek_last_error(zipper->miniz);
    }
    return MZ_ZIP_NO_ERROR;
}

EXPORT mz_zip_error zipper_finish_writing(Zipper* zipper) {
    if (!mz_zip_writer_end(zipper->miniz)) {
        return mz_zip_peek_last_error(zipper->miniz);
    }
    return MZ_ZIP_NO_ERROR;
}

EXPORT mz_zip_error zipper_get_data(Zipper* zipper, uint8_t** data_ptr_result, uint32_t* data_length_result) {
    *data_ptr_result = 0;
    *data_length_result = 0;
    if (!zipper->file_prepared) {
        return MZ_ZIP_INVALID_PARAMETER;
    }

    *data_ptr_result = zipper->data_ptr;
    *data_length_result = zipper->data_length;

    return MZ_ZIP_NO_ERROR;
}
